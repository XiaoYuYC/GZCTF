FROM node:24-alpine AS frontend
RUN sed -i 's#dl-cdn.alpinelinux.org/alpine#mirrors.aliyun.com/alpine#g' /etc/apk/repositories
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /src/GZCTF/ClientApp
COPY ./GZCTF/src/GZCTF/ClientApp/package.json ./
COPY ./GZCTF/src/GZCTF/ClientApp/pnpm-lock.yaml ./
COPY ./GZCTF/src/GZCTF/ClientApp/pnpm-workspace.yaml ./
RUN npm install --global pnpm@12.6.0 --registry=https://repo.huaweicloud.com/repository/npm/ && \
    pnpm config set registry "https://repo.huaweicloud.com/repository/npm/" && \
    pnpm install --frozen-lockfile
COPY ./GZCTF/src/GZCTF/ClientApp/ ./
RUN pnpm build

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS publish
RUN sed -i 's#dl-cdn.alpinelinux.org/alpine#mirrors.aliyun.com/alpine#g' /etc/apk/repositories

WORKDIR /src
COPY ./GZCTF/src/ ./
COPY --from=frontend /src/GZCTF/ClientApp/build ./GZCTF/ClientApp/build
RUN dotnet publish GZCTF/GZCTF.csproj \
    --configuration Release \
    --runtime linux-x64 \
    --self-contained false \
    --output /out \
    --source "https://api.nuget.org/v3/index.json" \
    -p:SkipFrontendPublish=true && \
    rm -rf /out/publish /out/wwwroot && \
    mkdir -p /out/wwwroot && \
    cp -a GZCTF/ClientApp/build/. /out/wwwroot/ && \
    find /out -maxdepth 1 -type f -name 'appsettings*.json' -delete

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS final

ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    LC_ALL=en_US.UTF-8

WORKDIR /app
COPY --from=publish /out/ ./
RUN sed -i 's#dl-cdn.alpinelinux.org/alpine#mirrors.aliyun.com/alpine#g' /etc/apk/repositories && \
    apk add --update --no-cache wget libpcap icu-data-full icu-libs \
    ca-certificates libgdiplus tzdata krb5-libs && \
    update-ca-certificates

EXPOSE 8080

HEALTHCHECK --interval=5m --timeout=3s --start-period=10s --retries=1 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["dotnet", "GZCTF.dll"]
