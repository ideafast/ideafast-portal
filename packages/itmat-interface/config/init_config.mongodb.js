/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

const database = 'dmpplus';
// Create a new database.
use(database);

// Create a new collection.
const collection1 = 'JOB_COLLECTION';
db.createCollection(collection1);
const collection2 = 'USER_COLLECTION';
db.createCollection(collection2);
const collection3 = 'ORGANISATION_COLLECTION';
db.createCollection(collection3);
const collection4 = 'STUDY_COLLECTION';
db.createCollection(collection4);
const collection5 = 'PROJECT_COLLECTION';
db.createCollection(collection5);
const collection6 = 'QUERY_COLLECTION';
db.createCollection(collection6);
const collection7 = 'LOG_COLLECTION';
db.createCollection(collection7);
const collection8 = 'DATA_COLLECTION';
db.createCollection(collection8);
const collection9 = 'ROLE_COLLECTION';
db.createCollection(collection9);
const collection10 = 'FIELD_COLLECTION';
db.createCollection(collection10);
const collection11 = 'FILES_COLLECTION';
db.createCollection(collection11);
const collection12 = 'SESSIONS_COLLECTION';
db.createCollection(collection12);
const collection13 = 'PUBKEY_COLLECTION';
db.createCollection(collection13);
const collection14 = 'STANDARDIZATION_COLLECTION';
db.createCollection(collection14);
const collection15 = 'CONFIG_COLLECTION';
db.createCollection(collection15);
const collection16 = 'ONTOLOGY_COLLECTION';
db.createCollection(collection16);
const collection17 = 'DOC_COLLECTION';
db.createCollection(collection17);
const collection18 = 'CACHE_COLLECTION';
db.createCollection(collection18);
const collection19 = 'DRIVE_COLLECTION';
db.createCollection(collection19);
const collection20 = 'GROUP_COLLECTION';
db.createCollection(collection20);
const collection21 = 'HASHNODE_COLLECTION';
db.createCollection(collection21);
const collection22 = 'COLDDATA_COLLECTION';
db.createCollection(collection22);


db.getCollection(collection2).insertOne({
      "_id" : ObjectId("65982904cfc27fc41ad30f60"),
      "id" : "8a51bda7-64b8-46af-b087-43caad743a81",
      "username" : "siyao",
      "email" : "sw5118@ic.ac.uk",
      "firstname" : "Siyao",
      "lastname" : "Wang",
      "organisation" : "ff8e14ad-76ef-4d0d-b3e5-d461a32275db",
      "type" : "ADMIN",
      "emailNotificationsActivated" : false,
      "resetPasswordRequests" : [
   
      ],
      "password" : "$2b$04$xgqJqt5A0RuR3jxl67xq2OYPKOmzGqi9uaBI9e06HUXwW8Hr4YO2y",
      "otpSecret" : "5NT4NQ6T5DPSP6Q4TWUD2FJPQ6G4J63L",
      "profile" : null,
      "description" : null,
      "expiredAt" : 1641383679055.0,
      "metadata" : {
   
      },
      "life" : {
          "createdTime" : NumberLong(1595242479055),
          "createdUser" : "8a51bda7-64b8-46af-b087-43caad743a81",
          "deletedUser" : null,
          "deletedTime" : null
      },
      "emailNotificationsStatus" : {
          "expiringNotification" : false
      }
});