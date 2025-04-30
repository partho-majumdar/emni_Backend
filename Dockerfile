FROM node:23-slim

WORKDIR /usr/src/app

RUN npm install -g nodemon

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]