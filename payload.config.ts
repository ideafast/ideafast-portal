/* eslint-disable */
import { buildConfig } from 'payload/config';
import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { webpackBundler } from '@payloadcms/bundler-webpack'



export default buildConfig({
    db: mongooseAdapter({
        url: 'mongodb://localhost:27017/?directConnection=true',
    }),
    editor: lexicalEditor(),

    collections: [
        {
            slug: 'users', // Ensure you have a 'users' collection for authentication
            auth: true, // Enable auth for this collection
            fields: [
                { name: 'name', type: 'text' },
                // Other fields for the users collection
            ],
        },
    ],
    admin: {
        bundler: webpackBundler(),

    },
    serverURL: 'http://localhost:3000',
    cors: '*'
});