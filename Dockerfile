FROM gitea.vinoxm.top/vinoxm/node-server-base:latest

WORKDIR /app

COPY . .

EXPOSE 8800
