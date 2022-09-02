FROM node:16-bullseye

COPY . ./app

WORKDIR /app

RUN npm i

CMD [ "yarn", "start" ]