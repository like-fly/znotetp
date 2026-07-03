# ZNote

ZNote是一款小而美的纯笔记应用，原生支持 Markdown 所见即所得，一处部署，随处可用。使用Bun + Hono.js + libSQL + Vue3开发。

![CleanShot 2026-06-26 at 14.09.56@2x.png](https://img.rss.ink/2026/06/26/K5PYJaG2.png)

* **演示地址：** [https://znote.xphub.dev/](https://znote.xphub.dev/)
* **账号：** `demo`
* **密码：** `blog.xiaoz.org`

## 特点

- **纯笔记应用**：无脑图、无清单、无多余功能，只专注于笔记本身
- **原生 Markdown**：所见即所得，支持所见即所得，专注内容不打扰
- **无同步困扰**：服务端集中存储数据，用户无需折腾同步方案
- **私有部署**：提供 Docker 私有部署，数据完全自主掌控，本地存储，隐私无忧
- **WEB 访问**：浏览器即开即用，无需安装客户端，跨平台无障碍
- **拖拽排序**：笔记分类、笔记内容均支持拖拽排序
- **数据导入**：支持将本地 .md 文件分类打包 ZIP 后一键导入
- **数据导出：** 支持笔记数据导出，方便您迁移到其它笔记
- **公共文档：** 一键将笔记本公开分享为类似语雀的文档系统
- **笔记分享：** 支持将单篇笔记设置密码公开分享，还可以设置有效期
- **版本历史**：自动记录最近 50 个历史版本，随时回滚无惧丢失
- **移动端支持**：提供配套的安卓APP，移动端使用更佳
- **多用户支持**：支持多账号体系（最多 5 用户），适合个人或家庭使用
- **轻量级**：基于 Bun + Hono.js + libSQL 打造，极速启动与低资源占用
- **全局搜索**：跨分类全文检索，输入关键词秒级定位所需笔记
- **API 支持**：提供 RESTful API，方便第三方工具集成与自动化操作

### Todo List

- [x] 导出所有笔记
- [x] 文档功能
- [x] 笔记分享
- [x] 手机客户端
- [ ] AI功能
- [ ] 支持多语言
- [ ] 浏览器扩展
- [ ] PC客户端

## 快速开始

使用 Docker Compose 一键部署（推荐）：

```yaml
services:
  znote:
    container_name: znote
    image: helloz/znote:latest
    ports:
      - "3888:3888"
    volumes:
      - "./data:/app/data"
    restart: always
    environment:
      TZ: Asia/Shanghai
```

启动服务：

```bash
docker compose up -d
```

或者使用 Docker 命令行部署：

```bash
docker run -d \
  --name znote \
  -p 3888:3888 \
  -v ./data:/app/data \
  --restart always \
  -e TZ=Asia/Shanghai \
  helloz/znote:latest
```

访问 `http://ip:3888`，首次使用会引导创建管理员账号。

> 更多说明请查看帮助文档：[https://znote.xphub.dev/doc/guide](https://znote.xphub.dev/doc/guide)

## 联系我们

- Blog：[https://blog.xiaoz.org/](https://blog.xiaoz.org/)
- X：[https://x.com/xiaozblog](https://x.com/xiaozblog)
