---
layout: default
---

# Setup of Sushi2 and introduction of basic usage

Sushi2 is a matrix library for JavaScript.
It works with modern web browsers and node.js server-side JavaScript environment.
By using [WebCL](https://en.wikipedia.org/wiki/WebCL) technology, the wrapper of OpenCL,
matrix operations are significantly accelerated with the power of GPU.
Even there are no WebCL support, most function of Sushi2 works.

<!--- setup instruction is almost same as README.md -->

## Setup for node.js
A npm package is provided, so installing it may be convenient.

```bash
npm install milsushi2
```

Sushi2 depends on [node-opencl](https://github.com/mikeseven/node-opencl) for GPU computing which allows dramatically faster computation.
This dependency is optional, so even the installation of node-opencl fails, Sushi2 can work without it.

In my environment (Ubuntu 14.04 + NVIDIA CUDA 7.5), installation with node-opencl requires additional environment variables.

```bash
CPLUS_INCLUDE_PATH=/usr/local/cuda/include LIBRARY_PATH=/usr/local/cuda/lib64 npm install milsushi2
```

```bash
$ node
> var $M=require('milsushi2');
undefined
> $M.initcl();//OpenCL initialization, true if succeeds
true
> var x = $M.jsa2mat([[1,2],[3,4]]);
undefined
> var y = $M.jsa2mat([[0.1,0.5],[0.7,0.0]]);
undefined
> $M.plus(x, y);
Matrix 2x2 single
1.100000023841858       2.5
3.700000047683716       4
```

## Setup for web browsers
Loading `milsushi2.js` (without WebCL support) or `milsushi2_cl.js` (WebCL support version) from html page is needed.
Download the js file from [releases page](https://github.com/mil-tokyo/sushi2/releases).

Unfortunately, currently a plugin is needed to enable WebCL. We tested on [webcl-firefox](https://github.com/toaarnio/webcl-firefox) plugin with [Firefox 32](https://ftp.mozilla.org/pub/firefox/releases/32.0/).
Compiled version of webcl-firefox plugin for Linux is [here](https://drive.google.com/file/d/0BxKvBdxU_LchMWVVUWFGVS1NcE0/view?usp=sharing) (Ubuntu 14.04 + CUDA 7.5, commit d87447f, License: MPL 2.0).

If WebCL is enabled, `$M.initcl()` should return true.

[Sample page](debugconsole.html) is plain page with only `milsushi2_cl.js` is loaded.

## Basic usage of Sushi2
The function set of Sushi2 is designed to be similar to MATLAB / Octave for making new users understand how to use easily.

In the documantation, we call `milsushi2` object as `$M`.
`$M` can be obtained by `var $M=require('milsushi2');`(in node.js), `var $M=milsushi2;`(in web browsers).

Functions for generating and operating matrices are placed under `$M` object.
Matrix object belongs to `$M.Matrix` class.

A matrix has at least 2 dimensions, and may have more than 2 dimensions.
The numeric type of elements in a matrix is 32-bit floating point number (noted as 'single') by default.
32-bit signed integer ('int32'), 8-bit unsigned integer ('uint8'), boolean value ('logical') are also supported.
The numeric type is noted as `klass` in the arguments in functions.

Common functions for generating a matrix:

- `$M.zeros(dim1, dim2)` generates matrix with size (dim1, dim2).
- `$M.jsa2mat(array)` generates matrix from JavaScript array (e.g. `[[1,2],[3,4]]`).

Common functions for operating a matrix:

- `$M.plus(A, B)` adds two matrices and returns new matrix contains the result.
- `$M.size(A, dim)` returns the dimension size of the matrix (scalar number).
- `$M.mat2jsa(A)` returns nested JavaScript array which represents the elements of the matrix.

Since JavaScript does not support operator overload, the expression `A+B` is invalid.
`$M.plus(A, B)` does the computation instead.

|MATLAB expression|Sushi2 expression|Comment|
|-|-|-|
|A+B|$M.plus(A, B)|Element-wise addition|
|A-B|$M.minus(A, B)|Element-wise subtraction|
|A.*B|$M.times(A, B)|Element-wise multiplication|
|A./B|$M.rdivide(A, B)|Element-wise division|
|A*B|$M.mtimes(A, B)|Matrix product|
|-A|$M.uminus(A)|Inversion of sign|

Most functions returns newly generated matrix instance and do not modify input matrices.

Get an element or subset from a matrix:

`A.get(idx1, idx2)`, where `A` is a matrix and `idx1, idx2` are scalar number, the expression returns the scalar number corresponding `A(idx1, idx2)`.
`idx*` can be colon object, which can be constructed by `$M.colon(start, stop)` function. A colon object represents a range.
By using colon object, a subset of a matrix is returned instead of scalar number.

Examples:

```javascript
var A = $M.jsa2mat([[1,2,3],
                    [4,5,6],
                    [7,8,9]]);
A.get(2, 1);//4
A.get(2, $M.colon());//Matrix of [[4,5,6]]
A.get($M.colon(2, 3), 3);//Matrix of [[6],[9]]
```

Set an element of a matrix:

`A.set(idx1, idx2, val)`, where `A` is a matrix and `idx1, idx2, val` are scalar number, the expression sets the value of `A(idx1, idx2)` as `val`.
Similar to `get` operation, `idx*` can be colon object and `val` can be either scalar number and matrix.

Examples:

```javascript
var A = $M.jsa2mat([[1,2,3],
                    [4,5,6],
                    [7,8,9]]);
A.set(2, 1, 40);
// A: [[1,2,3],[40,5,6],[7,8,9]]
A.set(2, $M.colon(), $M.jsa2mat([[14, 15, 16]]));
// A: [[1,2,3],[14,15,16],[7,8,9]]
A.set($M.colon(2, 3), 3, 99);//Setting scalar number to multiple elements
// A: [[1,2,3],[14,15,99],[7,8,99]]
```

The way of specifying element(s) of a matrix is called indexing, and Sushi2 allows most operations supported by [MATLAB](http://www.mathworks.com/help/matlab/math/matrix-indexing.html), except for expanding the size of matrix.
