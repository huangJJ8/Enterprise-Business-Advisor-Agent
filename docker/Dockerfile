# 设置源变量
ARG base_node=harbor.example.com/infra/node:18.17.0

FROM $base_node AS build-stage

WORKDIR /app

COPY package.json .

RUN npm config set registry https://registry.npmmirror.com/

RUN npm install --verbose --legacy-peer-deps

COPY . .


RUN npm run build

# production stage
FROM $base_node AS production-stage

COPY --from=build-stage /app/dist /app
COPY --from=build-stage /app/public /public
COPY --from=build-stage /app/docker/startup.sh /app/startup.sh
# 复制开发环境配置文件
COPY --from=build-stage /app/config.dev.yaml /app
COPY --from=build-stage /app/config.test.yaml /app
COPY --from=build-stage /app/config.pre.yaml /app
COPY --from=build-stage /app/config.prd.yaml /app
COPY --from=build-stage /app/package.json /app/package.json

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com/ && \
    npm install --production --verbose --legacy-peer-deps && \
    npm cache clean --force && \
    rm -rf /root/.npm

ENV TZ=Asia/Shanghai

EXPOSE 8025

# CMD ["node", "/app/main.js"]
RUN chmod +x /app/startup.sh

ENTRYPOINT ["sh", "/app/startup.sh"]

