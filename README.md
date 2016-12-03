# Sushi2 library
Matrix Library for JavaScript

This library is intended to be the fastest matrix library for JavaScript, with the power of GPU computing.
To gain best performance, [WebCL](https://en.wikipedia.org/wiki/WebCL) technology is used to access GPU from JavaScript.

[Interactive getting started on the browser](https://mil-tokyo.github.io/sushilab/?loadurl=notebooks/gettingstarted.json)

[Documents (work in progress)](https://mil-tokyo.github.io/sushi2/)

# Build for use in node.js
Since this project is written in TypeScript, transpiling to JavaScript is necessary.

```bash
npm install https://github.com/mil-tokyo/sushi2
```

Sushi2 depends on [node-opencl](https://github.com/mikeseven/node-opencl) for GPU computing which allows dramatically faster computation.
This dependency is optional, so even the installation of node-opencl fails, Sushi2 can work without it.

In my environment (Ubuntu 14.04 + NVIDIA CUDA 7.5), installation with node-opencl requires additional environment variables.

```bash
CPLUS_INCLUDE_PATH=/usr/local/cuda/include LIBRARY_PATH=/usr/local/cuda/lib64 npm install https://github.com/mil-tokyo/sushi2
```

# Build for use in web browser
To make single JavaScript file for web browsers, type the following commands:

```bash
git clone https://github.com/mil-tokyo/sushi2
cd sushi2
npm install
npm run browserify
```

This will generate `browser/milsushi2.js` (without WebCL support), and `browser/milsushi2_cl.js` (WebCL support version).

# Usage in node.js
You can import the module by `require('milsushi2')`.

Hello world in node shell

```javascript
var $M = require('milsushi2');
$M.initcl();//OpenCL initialization, true if succeeds
var x = $M.jsa2mat([[1,2],[3,4]]);
var y = $M.jsa2mat([[0.1,0.5],[0.7,0.0]]);
$M.plus(x, y);
```

# Usage in web browser
By loading them from html page (`<script src="milsushi2.js"></script>`), `milsushi2` global object is generated.

Hello world in html

```html
<script>
var $M = milsushi2;
var x = $M.jsa2mat([[1,2],[3,4]]);
var y = $M.jsa2mat([[0.1,0.5],[0.7,0.0]]);
alert($M.plus(x, y));
</script>
```

To use WebCL for GPU computing, use `milsushi2_cl.js` instead of `milsushi2`.

Unfortunately, currently a plugin is needed to enable WebCL. We tested on [webcl-firefox](https://github.com/toaarnio/webcl-firefox) plugin with [Firefox 32](https://ftp.mozilla.org/pub/firefox/releases/32.0/).
Compiled version of webcl-firefox plugin for Linux is [here](https://drive.google.com/file/d/0BxKvBdxU_LchMWVVUWFGVS1NcE0/view?usp=sharing) (Ubuntu 14.04 + CUDA 7.5, commit d87447f, License: MPL 2.0).

If WebCL is enabled, `$M.initcl()` should return true.

# License
MIT
