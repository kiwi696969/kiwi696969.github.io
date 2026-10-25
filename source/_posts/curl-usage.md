---
title: Curl 的使用
date: 2026-10-25 11:05:00
categories: [网络渗透]
tags: [curl, HTTP, PowerShell, 命令行]
description: curl 在 PowerShell 下的几个常用姿势——取网页、看响应头、POST JSON、用 -v 看握手细节、下载文件，最后把它写成一段状态码健康检查脚本。
---

curl 是一个在命令行中使用的数据传输工具，主要用于与服务器交互，比如下载文件、测试 API 接口、查看网页响应头等。它支持多种协议，下面以 HTTPS 为例。

基本用法是：

```
curl [选项] [URL]
```

<!-- more -->

## 一、在 PowerShell 里要加 .exe

打开 PowerShell，先验证 curl 的版本、确认能正常使用。

这里有个坑：PowerShell 把 `curl` 当成了内置命令 `Invoke-WebRequest` 的别名，而不是真正的 curl 工具。所以验证版本时必须写成 `curl.exe`：

```powershell
curl.exe --version
```

![curl 8.21.0 的版本与协议支持列表](/img/curl-01.png)

## 二、常用操作

### 1. 获取网页内容

`curl.exe` 加网址，直接把服务器返回的内容打印到终端：

```powershell
curl.exe -k https://example.com
```

![输出的是完整的 HTML 源码](/img/curl-02.png)

### 2. 查看响应头

加 `-I`，只发 HEAD 请求、只取响应头，用来做网络排查：

```powershell
curl.exe -I https://httpbin.org
```

![HTTP/1.1 200 OK 与各响应头字段](/img/curl-03.png)

### 3. 调试 API（POST JSON）

`-X` 指定方法，`-H` 加请求头，`-d` 带请求体：

```powershell
curl.exe -X POST -H "Content-Type: application/json" -d "{\"name\":\"test\"}" https://httpbin.org/post
```

![POST 后 httpbin 回显的请求内容](/img/curl-04.png)

截图里有两个现象值得注意：URL 被折成了两行，curl 报了 `Port number was not a decimal number`；返回结果里 `Content-Length` 只有 2、`json` 字段是 `null`，说明 JSON 在 PowerShell 的双引号转义中被截断了。

### 4. 查看请求细节

加 `-v`，能看到 DNS 解析、TLS 握手、发送的请求头和收到的响应头全过程：

```powershell
curl.exe -v https://example.com
```

![-v 输出：IP 解析、TLS 协商、请求与响应头](/img/curl-05.png)

### 5. 下载文件

`-o` 指定保存到本地的文件名：

```powershell
curl -o test.html https://example.com
```

然后用 `dir` 看，文件确实落盘了——577 字节，说明下载成功：

```powershell
dir test.html
```

![目录里出现 577 字节的 test.html](/img/curl-06.png)

## 三、写进自动化脚本

curl 不止能手动敲，它输出的是纯文本，很适合被脚本消费。下面这行只看 HTTP 状态码：

```powershell
$code = curl.exe -s -o NUL -w "%{http_code}" https://httpbin.org/status/200
if ($code -eq "200") { Write-Host "OK: 服务正常，状态码 $code" } else { Write-Host "FAIL: 服务异常，状态码 $code" }
```

每个参数各管一件事：

- `-s`：静默模式，不显示进度条和错误信息
- `-o NUL`：把正文丢弃，不写进终端也不写进文件
- `-w "%{http_code}"`：只把 HTTP 状态码作为输出
- `$code = ...`：把 curl 的结果存进变量，这一步是脚本化的关键
- `if ($code -eq "200")`：拿到状态码后自动判断，输出 `OK: 服务正常，状态码 200`

![脚本跑通，输出 OK: 服务正常](/img/curl-07.png)

## 四、其他协议

除了 HTTP/HTTPS，curl 也支持 FTP、SMTP、LDAP 等一长串协议（`--version` 那一屏里的 Protocols 就是）。比如列一个 FTP 目录：

```powershell
curl.exe -s ftp://ftp.gnu.org/
```

![FTP 目录以 ls 格式返回](/img/curl-08.png)
