'use strict';

var path = require('path');
var toc = require('markdown-toc');
var trash = require('trash');
var fs = require('fs');

var readmeFilePath = path.join(__dirname, 'readme.md');

var initialContents = fs.readFileSync(readmeFilePath, 'utf8');

var newContents = toc.insert(initialContents);

trash([readmeFilePath])
  .then(function () {
    fs.writeFileSync(readmeFilePath, newContents)
  });