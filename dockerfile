FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm cache clean --force
# RUN npm install 
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "sleep 60 && node src/server.js"]
