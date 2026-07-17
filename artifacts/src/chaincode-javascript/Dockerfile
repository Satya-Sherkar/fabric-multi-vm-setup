FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV CHAINCODE_SERVER_ADDRESS=0.0.0.0:9999

EXPOSE 9999

CMD ["sh", "-c", "set -e && \
  if [ -z \"$CHAINCODE_ID\" ]; then echo 'CHAINCODE_ID missing' && exit 1; fi && \
  echo \"Starting chaincode as CCAAS, ccid=$CHAINCODE_ID, listening on $CHAINCODE_SERVER_ADDRESS\" && \
  npm run start:server-nontls"]