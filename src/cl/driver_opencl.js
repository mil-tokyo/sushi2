'use strict';

(function () {
  var $M = require('../sushi');

  var $CL = {};
  $CL.WebCL = createWebCLObject();
  initWebCL($CL.WebCL);
  initUtilityMethods($CL.WebCL);

  function createWebCLObject() {
    // create WebCL object
    var web_cl;
    try {
      web_cl = require('node-opencl');
    } catch (e) {
      web_cl = void 0;
    }
    return web_cl;
  }

  function initWebCL(WebCL) {
    // decide platform to use
    var platform_list = WebCL.getPlatformIDs();
    var platform_priority = ['CUDA', 'AMD', 'Apple', 'OpenCL'];
    var priority = platform_priority.length + 1;
    var includeIndexOf = function (array, search) {
      for (var i = 0; i < array.length; i++) {
        if (search.indexOf(array[i]) !== -1) {
          return i;
        }
      }
      return array.length;
    };
    for (var i = 0; i < platform_list.length; i++) {
      var platform_tmp = platform_list[i];
      var platform_info_tmp = WebCL.getPlatformInfo(platform_tmp, WebCL.PLATFORM_NAME);
      var priority_tmp = includeIndexOf(platform_priority, platform_info_tmp);
      if (priority_tmp < priority) {
        priority = priority_tmp;
        $CL.platform = platform_tmp;
        $CL.platform_info = platform_info_tmp;
      }
    }

    try {
      var device_type = WebCL.DEVICE_TYPE_GPU;
      $CL.devices = WebCL.getDeviceIDs($CL.platform, device_type);//causes exception on firefox + Intel OpenCL
    } catch (ex) {
      $CL.devices = [];
    }
    if ($CL.devices.length === 0) {
      device_type = WebCL.DEVICE_TYPE_CPU;
      $CL.devices = WebCL.getDeviceIDs($CL.platform, device_type);;
    }
    
    // device selector (experimental)
    var device_index = 0;
    // Explicit setting by environment variable
    if ('OPENCL_DEVICE_INDEX' in process.env) {
      device_index = Number(process.env['OPENCL_DEVICE_INDEX']);
      if (device_index >= $CL.devices.length) {
        throw new Error('Invalid device index ' + device_index);
      }
    }
    $CL.selected_device = $CL.devices[device_index];
    $CL.device_info = WebCL.getDeviceInfo($CL.selected_device, WebCL.DEVICE_NAME);
    $CL.device_max_work_group_size = WebCL.getDeviceInfo($CL.selected_device, WebCL.DEVICE_MAX_WORK_GROUP_SIZE);

    // initialize methods dependent on implementation
    $CL.context = WebCL.createContext([WebCL.CONTEXT_PLATFORM, $CL.platform, 0], [$CL.selected_device]);
    $CL.kernelSetArg = function (kernel, idx, param, type) {
      var typestr = '';
      if (type !== void 0) {
        switch (type) {
          //TODO
          case WebCL.type.UINT:
            typestr = 'uint';
            break;
          case WebCL.type.INT:
            typestr = 'int';
            break;
          case WebCL.type.FLOAT:
            typestr = 'float';
            break;
          case WebCL.type.LOCAL_MEMORY_SIZE:
            typestr = 'local';
            break;
          default:
            throw new Error('Unsupported type');
        }
      } else {
        //buffer
        typestr = 'cl_mem';
      }
      WebCL.setKernelArg(kernel, idx, typestr, param);
    };
    WebCL.type = {
      CHAR: 0,
      UCHAR: 1,
      SHORT: 2,
      USHORT: 3,
      INT: 4,
      UINT: 5,
      LONG: 6,
      ULONG: 7,
      FLOAT: 8,
      HALF: 9,
      DOUBLE: 10,
      QUAD: 11,
      LONG_LONG: 12,
      VEC2: 65536,
      VEC3: 131072,
      VEC4: 262144,
      VEC8: 524288,
      VEC16: 1048576,
      LOCAL_MEMORY_SIZE: 255
    };

    if (WebCL.createCommandQueueWithProperties !== undefined) {
      $CL.queue = WebCL.createCommandQueueWithProperties($CL.context, $CL.selected_device, []); // OpenCL 2
    } else {
      $CL.queue = WebCL.createCommandQueue($CL.context, $CL.selected_device, 0); // OpenCL 1.x
    }

    $CL.buffers = 0;//number of existing buffers on device
  }


  function initUtilityMethods(WebCL) {
    $CL.createKernel = function (code, name) {
      if (!name) {
        name = 'kernel_func';
      }
      var program = WebCL.createProgramWithSource($CL.context, code);
      WebCL.buildProgram(program);
      return WebCL.createKernel(program, name);
    };

    $CL.createBuffer = function (byte_length) {
      var buffer = WebCL.createBuffer($CL.context, WebCL.MEM_READ_WRITE, byte_length);
      $CL.buffers++;
      return buffer;
    };

    $CL.writeBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      WebCL.enqueueWriteBuffer($CL.queue, buffer,
        true,//blocking write
        offset,
        typed_array.byteLength,
        typed_array);
    }

    $CL.executeKernel = function (kernel, params, parallelization, localWS) {
      for (var i = 0; i < params.length; i++) {
        if (params[i].type === void 0) {
          // Matrix class
          $CL.kernelSetArg(kernel, i, params[i].datum._clbuffer);
        } else {
          // native type
          $CL.kernelSetArg(kernel, i, params[i].datum, params[i].type);
        }
      }

      var globalWS;
      if (localWS == void 0) {
        if (parallelization.length === undefined) {
          //1-d parallelization
          localWS = [64];
          globalWS = [Math.ceil(parallelization / localWS[0]) * localWS[0]];
        } else {
          //n-d parallelization
          var localWS_each = [64, 8, 4][parallelization.length];
          localWS = [];
          globalWS = [];
          for (var i = 0; i < parallelization.length; i++) {
            localWS.push(localWS_each);
            globalWS.push(Math.ceil(parallelization[i] / localWS_each) * localWS_each);
          }
        }
      } else {
        globalWS = [];
        for (var i = 0; i < parallelization.length; i++) {
          globalWS.push(Math.ceil(parallelization[i] / localWS[i]) * localWS[i]);
        }
      }
      // Execute kernel
      WebCL.enqueueNDRangeKernel($CL.queue, kernel,
        globalWS.length,
        null,
        globalWS,
        localWS);
      $CL.flush();
    };

    $CL.flush = function () {
      WebCL.flush($CL.queue);
    };

    $CL.finish = function () {
      WebCL.finish($CL.queue);
    };

    $CL.readBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      WebCL.enqueueReadBuffer($CL.queue, buffer,
        true,//blocks until the reading completes
        offset,
        typed_array.byteLength,
        typed_array);
    }

    $CL.releaseBuffer = function (buffer) {
      WebCL.releaseMemObject(buffer);
      $CL.buffers--;
    };
  }

  module.exports = $CL;
})();
