const path = require('path');
const baseConfig = require('../../../../config/webpack.lib.config');

baseConfig.output.path = path.resolve(__dirname, '../dist');
baseConfig.output.library = 'itmatCommons';

module.exports = {
    ...baseConfig
};