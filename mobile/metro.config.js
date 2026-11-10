/** @format */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [/.*[\\/]\.next[\\/].*/, /.*[\\/]\.crea-accent[\\/]database[\\/].*/, /.*[\\/]clients[\\/]desktop[\\/](?:release|dist)[\\/].*/];

module.exports = config;
