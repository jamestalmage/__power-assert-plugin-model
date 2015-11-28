# Pluggable Assertions

> A proposal for creating a power-assert plugin ecosystem.

<!-- toc -->

## Intro

`power-assert` is awesome, and it needs wider adoption. I think the best way to do this is to create an ecosystem of assertion libraries, renderers, and test frameworks.

## Plugin Definitions

Plugins will be simple modules deployed to `npm`. They will be modeled after `Babel` plugin definitions:

 1. The module name will be prefixed with a custom prefix.

  - `power-assert-library-` for assertion libraries.

  - `power-assert-renderer-` for renderers.

  - `power-assert-preset-` for presets.

 2. Every plugin module will return a function. The functions *may* take any number of configuration parameters, but *should* return a result with sensible defaults if no parameters are provided.

 3. In config files, config parameters can be provided to plugins using the array syntax popularized by `browserify` and `babel`.

  ```js
  // power-assert-preset-james-talmage-favorites.js
  module.exports = function () {
    return {
      libraries: [
        'assert',                  // power-assert-library-assert - with defaults.
        ['sinon', false, {...}]    // power-assert-library-sinon - passing two custom configuration parameters.
      ],
      renderers: [
        'succint'                  // power-assert-renderer-succint - with defaults.
      ]
    };
  };
  ```

## Assertion Libraries

> `power-assert` configurations for popular assertion libraries that are easily shared.

### Library Definition

Assertion library authors will need to communicate the method signature of their library. The must provide the following information.

 1. The assertion module itself. This will be an object/function with any number of `assertion functions` attached.

  Initially all `assertion functions` *must* synchronously throw to indicate an error, or return a non-promise indicating the assertion passed. At some point in the future, we may allow a promise return value, indicating an assertion that must be performed asynchronously. Since most test frameworks currently expect synchronous results from their assertion libraries, we will need to punt on this until the status quo changes. Assertion library authors should avoid returning promises in anticipation of possible future changes.

  The plugin system will be used to copy assertion functions from multiple libraries into a single API. It should be assumed that the assertion function will be called with an indeterminate `this` value. Library authors should use closures for helper functions, or manually bind the `this` context using `fn.bind()`. This can be done in the plugin
 module so as not to pollute the core assertion library.


 2. Signature of all assertions available to be wrapped.

  This is basically identical to the `patterns` option currently available in `empower`.

 3. List all additional assertion functions that are not suitable for wrapping, but should be copied to the enhanced assertion object.

  Most assertion libraries come with some assertions that may be valuable to the user, but for various reasons, should not be wrapped by `power-assert`. We ask authors still provide `patterns` for these, so we can inspect for the traditional optional `message` parameter.

 4. An additional `allowDestructive` parameter (default is `false`). Whether consumers of the library can request the module be manipulated directly instead of copied. My hope is that the plugin system makes loading an enhanced assertion object so easy, that `destructive: true` is no longer needed and can be deprecated.

An example Assertion Library definition:

```js
// power-assert-library-assert.js
module.exports = function () {
  return {
    // Implementation wrapped in a function to guard agains libraries that are expensive to `require`.
    // Useful for AVA, which needs access to the `patterns` in the main thread, but not the assertion library.
    implementation: function () {
      return require('assert');
    },
    // alternative shorthand:
    // implementation: 'assert',
    patterns: [
      'assert(value, [message])',
      'assert.ok(value, [message])',
      'assert.equal(actual, expected, [message])',
      'assert.notEqual(actual, expected, [message])',
      'assert.strictEqual(actual, expected, [message])',
      'assert.notStrictEqual(actual, expected, [message])',
      'assert.deepEqual(actual, expected, [message])',
      'assert.notDeepEqual(actual, expected, [message])',
      'assert.deepStrictEqual(actual, expected, [message])',
      'assert.notDeepStrictEqual(actual, expected, [message])'
    ],
    unwrappablePatterns: [
      'assert.throws(fn, [message])',
      'assert.fail(actual, expected, message, operator)',
      'assert.ifError(value)'
    ],
    allowDestructive: false
  }
}
```

### Library Consumption

> Provide a simple means for users and test framework authors to access assertion frameworks as defined above.

#### Simple use by users:

```js
var loader = require('power-assert-loader');

var assert = loader.loadLibrary('assert');

assert.ok(true);
```

#### Advanced use in Testing Frameworks:

* Note: hopefully assertion frameworks will not access this directly, but allow users to specify their own configuration presets.*

```js
var support = require('power-assert-support');

var definition = support.loadLibrary('assert');

// Load the patterns but remap the target object name
// In this case `assert.ok` becomes `t.ok`.
var patterns = definition.patterns('t');
var unwrappable = definition.unwrappablePatterns('t');

var assert = definition.loadImplementation({
  onSuccess: function () { /* ... */ },
  onError: function () { /* ... */ }
});

// alternate
var assert = {};

definition.loadImplementation({
  target: assert // copy enhanced methods onto this target.
});

definition.loadBabelPlugin();
definition.loadEstraversePlugion();
// etc.
```

### Ideas / Pending Specifications:

 1. Convenience functions for Frameworks to filter incompatible methods (i.e. prevent methods conflict with or would  overwrite critical members of their exposed assertion object, etc).

 2. Alternate functions for many of the advanced framework functions that allow manipulation of the parsed pattern AST, instead of strings.

 3. A well defined mechanism / pattern for assertion libraries to attach additional metadata to thrown errors and / or the `powerAssertContext`. Useful if assertion library authors want to create custom renderers specific to their library. (i.e. sinon can attach information on every spy call, etc.).

## Renderers

This seems the easiest to implement. Simply wrap renderers with plugin definitions similar to those in assertion libraries. Some possible specific additions:

 1. Label a renderer as being specific to a particular assertion library. A custom `sinon spy` renderer for example would likely not be useful on assertion errors created by anything but `sinon`.

 2. Some sort of filter handshake between Test Frameworks and the runner. (i.e. Tell this renderer I only want it to render in these specific scenarios).

## Presets

> A way to combine configured assertion libraries, renderers, and other presets into a portable, shareable definition of the assertion API you want.

Test runners should get out of the business of writing their own assertion API's. You can never satisfy everyone, so leave people to choose their own. This is one of the reasons I have always enjoyed `mocha`, but `mocha` requires I sacrifice plan counts, and does not have the promise of screamingly fast test execution that `AVA`` will soon enjoy.

  ```js
  // power-assert-preset-james-talmage-favorites.js
  module.exports = function () {
    return {
      libraries: [
        'assert',                       // power-assert-library-assert - with defaults.
        ['preset-sinon', false, {...}]  // see `Preset Merging` below.
      ],
      renderers: [
        'succint'                  // power-assert-renderer-succint - with defaults.
      ]
    };
  };
  ```

### Preset Merging

One place the `Babel` preset definitions break down is the ability to define merge order when your preset both extends other presets, and specifies additional plugins (there is no way to insert a desired transform in the toolchain before the presets). Even though I don't see how merge order would affect us, we should preempt such problems by providing a means of defining presets with a clear merge order.


#### Option 1

> Load the preset once, and specify merge location in each one.

```js
// inside a preset function
return {
  presets: [
    // load the preset with config options, but do not merge it.
    // not required if you do not need to provide configuration options to the underlying preset.
    ['sinon', optionA, optionB]
  ],
  libraries: [
    'assert',
    'preset-sinon' // merge the assertions libraries from the sinon-preset configured above
  ]
};
```

To prevent ambiguity, it would be an error to create an assertion library or renderer plugin that started with the word "preset". (i.e. the following would not be allowed `power-assert-library-preset-foo`);

#### Option 2

> Specifying config options inline.


```js
// inside a preset function
return {
  libraries: [
    'assert',
    ['preset-sinon', optionA, optionB] // load libraries preset-sinon with specified config
  ],
  renderers: [
    'succinct',
    ['preset-sinon', optionC, optionD] // different config options for the preset-sinon renderers
  ],

};
```

This means the preset will be loaded twice, with possibly different options. I think Option 1 will be the predominant way to provide options, and Option 2 may introduce errors if renderers expect the assertion library to be configured with the exact same options. But it also allows deep and powerful customization. Also, it is possible a preset would only contains renderers. In that case it would be nicer if the config for that preset was inline.

### Filtering Assertion Libraries

We should provide a way inside a preset definition to only grab a specific set of assertion functions from an underlying library. (i.e., I want to use the `tap` assert library, but I don't like that `t.true` just means truthy instead of `=== true`). So we should provide a way of saying "grab `tap` (less `t.true`), and merge `t.true` from some other library that defines it the way I want.

### Remapping Assertion Function Names

If there are conflicting names in two assertion libraries I want to use (or I just don't like how a function is named), provide a method to rename.

### Mapping Libraries onto sub-objects

Up till now, the examples have assumed the functions from all the assertion libraries specified in your preset would all be merged onto a single object. People merging more than one or two libraries will almost certainly run into conflicts. Provide a means to say "merge stuff from sinon onto `assert.sinon.XXX`"