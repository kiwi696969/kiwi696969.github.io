---
title: Pikachu 靶场搭建
date: 2026-11-01 21:10:00
categories: [网络渗透]
tags: [pikachu, 靶场搭建, phpstudy, 小皮面板, Web安全]
description: 在 Windows 上用 phpstudy 小皮面板从零搭起 Pikachu 漏洞练习平台——下载源码、启动 Apache 与 MySQL、建库、改配置文件、浏览器完成安装，附常见报错排查。
---

Pikachu 是一个开源的 Web 漏洞练习平台，把 SQL 注入、XSS、CSRF、文件包含、反序列化这些常见漏洞做成了可以直接点着玩的关卡。相比自己写靶场，它胜在开箱即用、每关都带提示，适合刚入门 Web 安全时练手。

这篇记录一下在 Windows 上从零把它跑起来的过程，用的是最常见的「phpstudy 小皮面板 + Apache + MySQL」组合。

<!-- more -->

## 一、环境

| 项目 | 版本 |
|------|------|
| 系统 | Windows |
| Web 面板 | 小皮面板 8.1.1.3（phpstudy）|
| Web 服务 | Apache 2.4.39 |
| 数据库 | MySQL 5.7.26 |

## 二、第一步：下载源码

![GitHub 仓库页与 Download ZIP](/img/pikachu-01.png)

源码在 `github.com/zhuifengshaonianhanlu/pikachu`，注意是 **master 分支**（这个仓库的分支名就叫 master，不是 main）。点右上角绿色的 `Code` 按钮，在弹层里选 **Download ZIP**，不要用 `git clone`——克隆下来会多带一个 `.git` 目录，拷进 WWW 之后容易被 Web 服务当成可访问路径暴露出去。

## 三、第二步：装小皮面板并启动服务

![小皮面板首页，Apache 与 MySQL 已启动](/img/pikachu-02.png)

到 `xp.cn` 下载 Windows 版装上，打开后首页就是「一键启动」。这里要注意两点：

- **只需要 Apache + MySQL**，Nginx 保持停止状态。Apache 和 Nginx 默认都抢 80 端口，同时开会有一个起不来。
- 看左下角状态栏，出现 `Apache2.4.39 已启动`、`MySQL5.7.26 已启动` 才算成功。如果点启动没反应，基本是端口被占了（见文末排查表）。

## 四、第三步：源码放进 WWW 目录

![解压得到的 pikachu-master 文件夹](/img/pikachu-03.png)

ZIP 解压出来是 `pikachu-master` 这个文件夹。

![小皮面板安装目录，里面有 WWW](/img/pikachu-04.png)

找到小皮面板的安装目录（右键面板图标 → 打开文件位置），里面有个 **WWW** 文件夹，这就是 Web 根目录，Apache 对外提供服务的所有东西都放这儿。

把整个 `pikachu-master` 拷进 WWW，然后**重命名成 `pikachu`**，这样访问路径就是干净的 `localhost/pikachu/`，不用每次都敲一长串。

![WWW 目录下的 pikachu](/img/pikachu-05.png)

放好之后 WWW 里长这样。截图里那个 `pikachu_backup_2026...` 是改配置前的备份，留着看个人习惯，实际不影响运行；`error` 和 `index.html` 是面板自带的，别动。

## 五、第四步：建数据库

这一步截图没有，但**不能跳过**——Pikachu 的安装页只负责建表，数据库本身得先存在。

在小皮面板左侧点「**数据库**」→「新建数据库」：

| 字段 | 填什么 |
|------|--------|
| 数据库名 | `pikachu` |
| 用户名 | `pikachu` |
| 密码 | 自己设一个，记下来 |
| 字符集 | `utf8` |

> 也可以直接用 root 账号，但单独建库建号更清晰，万一密码写错了只影响这一个站，不会连累其他项目。

## 六、第五步：改配置文件

![pikachu 目录下的 inc 文件夹](/img/pikachu-06.png)

进 `pikachu/inc/`，里面有个 `config.inc.php`，就是数据库连接配置。

![config.inc.php 里的五个常量](/img/pikachu-07.png)

用记事本打开它，改这五行的值：

```php
define('DBHOST', '127.0.0.1');   // 数据库地址，本机就是 127.0.0.1
define('DBUSER', 'pikachu');     // 上一步建库时设的用户名
define('DBPW',   '你的密码');     // 上一步建库时设的密码
define('DBNAME', 'pikachu');     // 数据库名
define('DBPORT', '3306');        // MySQL 端口，默认 3306
```

**五个值必须和第四步建库时的信息完全一致**，包括大小写。这里写错一个，后面安装页会直接报数据库连接失败。

改完存盘。如果用记事本另存为，注意别把编码改成 UTF-8 with BOM，PHP 文件带 BOM 会在页面顶部多出一段空白。

## 七、第六步：浏览器完成安装

![安装完成后的 Pikachu 首页](/img/pikachu-08.png)

浏览器访问：

```
http://localhost/pikachu/index.php
```

首次访问会跳到安装页，点「安装 / 初始化」让它自动建表。看到左侧这排漏洞菜单（暴力破解、XSS、CSRF、SQL-Inject、RCE……）就说明装好了。

以后想重装，把 `pikachu/install.php` 重新访问一次即可。

## 八、常见问题排查

| 现象 | 原因与处理 |
|------|-----------|
| 页面提示「数据库连接失败」 | `config.inc.php` 的库名、用户名、密码、端口和实际建库信息不一致，逐项核对 |
| Apache 起不来 / 80 端口被占用 | 关掉 IIS、迅雷、其他 Web 面板；或在面板「网站 → 管理 → 修改端口」换一个 |
| MySQL 起不来 | 本机装过独立版 MySQL，3306 冲突。面板里改 MySQL 端口，同时把 `config.inc.php` 的 `DBPORT` 改成同一个 |
| 访问 404 | `pikachu` 文件夹没放在 WWW 根下，或名字拼错（区分大小写） |
| 安装页中文乱码 | 建库时字符集没选 utf8，删库重建 |
| 页面顶部多一行空白 | `config.inc.php` 被存成了 UTF-8 with BOM，用记事本「另存为」选 UTF-8（无 BOM） |

## 九、安全提醒

Pikachu 本身就是一堆故意留的洞，**只在本机或内网用**。Windows 防火墙如果放行了 Apache，记得确认只对本地生效，别让它监听在公网网卡上——这东西一旦暴露出去，等于把一台满是后门的服务器送人。

另外 `config.inc.php` 里是明文数据库密码，如果要截图发到网上，建议把密码那一行打码，或者装完就换成一次性密码。
