#Develop branch

To deploy the app, some programs need to be installed:

## 0. Prerequisites
### - Mongodb:

Refer [this to install Mongodb](https://docs.mongodb.com/manual/installation/).

A [replica set](https://docs.mongodb.com/manual/replication/) is required to run the app.

You need to [deploy a Mongodb replica set](https://docs.mongodb.com/manual/tutorial/deploy-replica-set/) at your local PC.

Or [convert a standalone to a replica set](https://docs.mongodb.com/manual/tutorial/convert-standalone-to-replica-set/).

### - MinIO:

MinIO is required for high-performance object storage. Refer [this to install MinIO](https://docs.min.io/docs/minio-quickstart-guide.html)

### - Initalise the database for the app:

Go to `packages/itmat-interface/src/databaseSetup` to initialise the database using the script `collectionsAndIndexes.ts`.

This script needs to be editted to run the `setupDatabase` function:
`setupDatabase(mongostr, databaseName).then(() => {});;`

Where `mongostr` and `databaseName` are mongodb connection string and database name for the app, respectively.


To start the app, run the following commands at root folder (you will have to have `yarn` installed):

## 1. Install dependencies and build
```bash
yarn install && yarn build
```

## 2. Add your config (and edit them in your editor of choice)
```bash
cp packages/itmat-interface/config.sample.json packages/itmat-interface/config.json

cp packages/itmat-job-executor/config.sample.json packages/itmat-job-executor/config.json
```
These config files need to be editted accordingly for Mongodb database (`database{ }`) and MinIO (`objectStore{ }`).

`nodemailer{ }` in `packages/itmat-interface/config.json` is also required to configure for email service.

## 3. Start the app (access it on localhost:3000)
```bash
yarn start
```

