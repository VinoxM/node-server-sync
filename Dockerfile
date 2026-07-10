FROM gitea.vinoxm.art/vinoxm/node-server-base:latest

WORKDIR /app

COPY . .

EXPOSE 8800
