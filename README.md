# ZNoteTP

ZNoteTP 源根据ZNote二次开发，感谢 @xiaoz，这里附上原项目地址与演示地址

* ZNote: [https://github.com/helloxz/znote](https://github.com/helloxz/znote)
* ZNote Demo: https://znote.xphub.dev/


ZNoteTP 是在 ZNote 的基础上尽量做减法，使用上因为我比较喜欢 Typora，我一直在找一款像 Typora 类似的简洁的 Docker 部署的，Web 访问的笔记软件，可惜没有找到，ZNote 本身比较简洁，笔记软件该有的重要功能都有，所以在此基础上改造更方便，于是有了 ZNoteTP，所以TP的含义就是 Typora 风格的意思。

如果没有ZNote，我的想法可能是做一款 Web 访问的极简笔记软件，可能数据库都不需要，直接按目录结构保存即可，与Typora类似。


## 特点

类 Typora 的使用方式，目录型，简单

## 快速开始

使用 Docker Compose 一键部署（推荐）：

```yaml
services:
  znote:
    container_name: znote
    image: likeflyme/znotetp:latest
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
  likeflyme/znotetp:latest
```

访问 `http://ip:3888`，首次使用会引导创建管理员账号。

> 更多说明请查看帮助文档：[https://znote.xphub.dev/doc/guide](https://znote.xphub.dev/doc/guide)

