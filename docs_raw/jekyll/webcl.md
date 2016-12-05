---
layout: default
---

# Notes on using WebCL acceleration

## System requirements
Sushi2 supports GPU acceleration via [WebCL](https://en.wikipedia.org/wiki/WebCL) platform.
WebCL is a JavaScript wrapper of [OpenCL](https://en.wikipedia.org/wiki/OpenCL) platform.
Thus, GPU driver which supports OpenCL have to be installed on the computer.
To be precise, OpenCL supports not only GPU but multi-core CPU and other accelerators, but performance on accelerators other than GPU is not considered in Sushi2.

For web browser environment, WebCL interface have to be installed on the browser. See ["Setup for web browsers" section in setup.html](setup.html).

For node.js environment, Sushi2 uses [node-opencl](https://github.com/mikeseven/node-opencl) as OpenCL interface.
There are [node-webcl](https://github.com/mikeseven/node-webcl) library but it is deprecated.


## Computing on WebCL environment
Basically, Sushi2 is designed to not bothering users whether matrices are on CPU memory or GPU memory.
Once a matrix is copied to GPU memory, the operations for the matrix are performed on GPU.

To use WebCL, initialization method have to be called.

```javascript
$M.initcl();
```

This returns `true` if the initialization succeeds, `false` otherwise.
In the initialization, functions are substituted by GPU-support version.
Some functions do not support GPU, and calling them may lead to error. 

To copy a matrix to GPU memory, use `$M.gpuArray()` method. To copy a matrix back to CPU memory, use `$M.gather()` method. To identify where the matrix is placed on, use `$M.devicetype()` method.

```javascript
var cpu_A = $M.jsa2mat([[1,2],[3,4]]);
var gpu_A = $M.gpuArray(cpu_A);
var cpu_A_2 = $M.gather(gpu_A);

$M.devicetype(cpu_A);//'cpu'
$M.devicetype(gpu_A);//'cl'
$M.devicetype(cpu_A_2);//'cpu'
```

Operations whose arguments are matrices on GPU will be performed on GPU.

```javascript
var cpu_A = $M.jsa2mat([[1,2],[3,4]]);
var cpu_B = $M.jsa2mat([[5,6],[7,8]]);
var gpu_A = $M.gpuArray(cpu_A);
var gpu_B = $M.gpuArray(cpu_B);

var gpu_C = $M.plus(gpu_A, gpu_B);//performed on GPU
var cpu_C = $M.gather(gpu_C);//take result to CPU

$M.plus(cpu_A, cpu_B);//performed on CPU
$M.plus(gpu_A, cpu_B);//performed on GPU, at least one matrix is on GPU
```

You may see performance improvement in matrix multiplication.

```javascript
var cpu_A = $M.rand(1000, 1000);
var cpu_B = $M.rand(1000, 1000);
var cpu_begin = Date.now();
var cpu_C = $M.mtimes(cpu_A, cpu_B);
var cpu_end = Date.now();
console.log('CPU calculation time: ' + (cpu_end - cpu_begin) + 'ms');
var gpu_begin = Date.now();
var gpu_A = $M.gpuArray(cpu_A);
var gpu_B = $M.gpuArray(cpu_B);
var gpu_C = $M.mtimes(gpu_A, gpu_B);
var cpu_C = $M.gather(gpu_C);
var gpu_end = Date.now();
console.log('GPU calculation time: ' + (gpu_end - gpu_begin) + 'ms');
```

First run may be slow because compile of GPU computation code runs.

## Memory management
JavaScript supports garbage collection (GC), which releases memory for objects when they are no longer referenced.
For matrices on CPU, GC will release the memory. However, matrices on GPU are not released by GC currently.
To release memory on GPU, the user has to call `Matrix.destruct()` method after a matrix becomes no longer necessary.

```javascript
function foo() {
  var cpu_A = $M.zeros(100, 100);
  var gpu_A = $M.gpuArray(cpu_A);
  var cpu_B = $M.ones(100, 100);
  var gpu_B = $M.gpuArray(cpu_B);
  gpu_A.destruct();//releases GPU memory for gpu_A
  return;
  // cpu_A, cpu_B is released by GC
  // gpu_B is not released; e.g. memory leak
}
```

This restriction is bothering when we want to do multiple operations in one statement.
For example, `$M.plus($M.mtimes(gpu_A, gpu_B), gpu_C);` generates intermediate matrix `$M.mtimes(gpu_A, gpu_B)` and we cannot call `destruct()` on it.
To circumvent this issue, `$M.autodestruct()` function is provided to simplify the code in exchange for little overhead.

```javascript
var gpu_A = $M.gpuArray($M.rand(10, 10));
var gpu_B = $M.gpuArray($M.rand(10, 10));
var gpu_C = $M.gpuArray($M.rand(10, 10));

var result = $M.autodestruct(function () {
  var gpu_D = $M.plus($M.mtimes(gpu_A, gpu_B), gpu_C);
  var gpu_E = $M.minus(gpu_D, 1);
  return gpu_E;
  // matrices created in this function are released here
  // except for returned matrix
  // e.g. gpu_D and $M.mtimes(gpu_A, gpu_B) are released
});// result == gpu_E
```

`$M.autodestruct(f)` takes a function `f` as the argument, and calls it. After execution of `f` is finished, matrices created within it are released (`destruct()` for each matrix is called).
`f` can return value, and if it is a matrix, it is not released. Return value can be JavaScript Array and object, and if it contains matrices, they are not released.
Also, `$M.autodestruct` can be nested.

