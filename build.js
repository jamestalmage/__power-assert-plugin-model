'use strict';

var path = require('path');
var toc = require('markdown-toc');
var trash = require('trash');
var fs = require('fs');

var readmeFilePath = path.join(__dirname, 'readme.md');

var initialContents = readFileSync(readmeFilePath, 'utf8');

var newContents = toc(initialContents).inject;

trash(readmeFilePath)
  .then(function () {
    fs.writeFileSync(readmeFilePath, newContents)
  });