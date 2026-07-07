FROM oven/bun:1.3.14-slim

WORKDIR /app
COPY . ./

RUN bun install
RUN cd frontend && bun install
RUN sh build_frontend.sh

VOLUME /app/data
EXPOSE 3888
CMD ["sh", "run.sh"]
