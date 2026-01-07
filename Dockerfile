# 使用官方 Node.js 镜像作为基础镜像
# 如果官方还没有 24.12.2 的镜像，可以使用 node:current-slim 或自行构建
# FROM node:24.12-slim
FROM gitea-http.gitea.svc.cluster.local:3000/vinoxm/node-server-base:latest

# 设置工作目录
WORKDIR /app

# 拷贝源代码
COPY . .

# 暴露服务端口（假设你的 Node 服务监听 8800）
EXPOSE 8800

# 启动命令
CMD ["node", "src/application.js", "--active=main,docker"]