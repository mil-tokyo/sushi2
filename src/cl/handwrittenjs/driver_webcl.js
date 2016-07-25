'use strict';

(function () {
  var $M = require('../../sushi');

  var $CL = {};
  var env = getEnvironment();
  $CL.WebCL = createWebCLObject();
  initWebCL($CL.WebCL);
  initUtilityMethods($CL.WebCL);

  function getEnvironment() {
    // check environment
    if (typeof window !== 'undefined' && window.webcl !== void 0) {
      var env = 'ff';
    } else if (typeof WebCL === 'function') {
      var env = 'chromium';
    } else {
      var env = void 0;
    }
    return env;
  }

  function createWebCLObject() {
    // create WebCL object
    var web_cl = void 0;
    switch (env) {
      case 'chromium':
        web_cl = new WebCL();
        break;
      case 'ff':
        web_cl = window.webcl;
        break;
    }
    return web_cl;
  }

  function initWebCL(WebCL) {
    // decide platform to use
    var platform_list = WebCL.getPlatforms();
    var platform_index = 0;
    if (false) {
/*    if ('OPENCL_PLATFORM_INDEX' in process.env) {
      platform_index = Number(process.env['OPENCL_PLATFORM_INDEX']);
      if (platform_index >= platform_list.length) {
        throw new Error('Invalid platform index ' + platform_index);
      }*/
    } else {
      //select by name
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
        var platform_info_tmp = platform_tmp.getInfo(WebCL.PLATFORM_NAME);
        var priority_tmp = includeIndexOf(platform_priority, platform_info_tmp);
        if (priority_tmp < priority) {
          priority = priority_tmp;
          platform_index = i;
          $CL.platform = platform_tmp;
          $CL.platform_info = platform_info_tmp;
        }
      }
    }
    $CL.platform = platform_list[platform_index];
    $CL.platform_info = $CL.platform.getInfo(WebCL.PLATFORM_NAME);

    try {
      var device_type = WebCL.DEVICE_TYPE_GPU;
      $CL.devices = $CL.platform.getDevices(device_type);//causes exception on firefox + Intel OpenCL
    } catch (ex) {
      $CL.devices = [];
    }
    if ($CL.devices.length === 0) {
      device_type = WebCL.DEVICE_TYPE_CPU;
      $CL.devices = $CL.platform.getDevices(device_type);;
    }
    
    // device selector (experimental)
    var device_index = 0;
    // Explicit setting by environment variable
/*    if ('OPENCL_DEVICE_INDEX' in process.env) {
      device_index = Number(process.env['OPENCL_DEVICE_INDEX']);
      if (device_index >= $CL.devices.length) {
        throw new Error('Invalid device index ' + device_index);
      }
    }*/
    $CL.selected_device = $CL.devices[device_index];
    $CL.device_info = $CL.selected_device.getInfo(WebCL.DEVICE_NAME);
    $CL.device_max_work_group_size = $CL.selected_device.getInfo(WebCL.DEVICE_MAX_WORK_GROUP_SIZE);

    // initialize methods dependent on implementation
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

    switch (env) {
      case 'ff':
        $CL.context = WebCL.createContext($CL.platform, device_type);
        var table_primitive = {};
        table_primitive[WebCL.type.CHAR] = Uint8Array;
        table_primitive[WebCL.type.UCHAR] = Int8Array;
        table_primitive[WebCL.type.SHORT] = Int16Array;
        table_primitive[WebCL.type.USHORT] = Uint16Array;
        table_primitive[WebCL.type.INT] = Int32Array;
        table_primitive[WebCL.type.UINT] = Uint32Array;
        table_primitive[WebCL.type.LONG] = Int32Array;//64bit variable is not supported
        table_primitive[WebCL.type.ULONG] = Uint32Array;
        table_primitive[WebCL.type.FLOAT] = Float32Array;
        table_primitive[WebCL.type.HALF] = Float32Array;//16bit float is not supported
        table_primitive[WebCL.type.DOUBLE] = Float64Array;
        table_primitive[WebCL.type.QUAD] = Float32Array;//not supported
        table_primitive[WebCL.type.LONG_LONG] = Float32Array;//not supported
        var table_vec_len = {};
        table_vec_len[0] = 1;
        table_vec_len[WebCL.type.VEC2] = 2;
        table_vec_len[WebCL.type.VEC3] = 3;
        table_vec_len[WebCL.type.VEC4] = 4;
        table_vec_len[WebCL.type.VEC8] = 8;
        table_vec_len[WebCL.type.VEC16] = 16;
        $CL.kernelSetArg = function(kernel, idx, param, type) {
          if (type !== void 0) {
            if (type == WebCL.type.LOCAL_MEMORY_SIZE) {
              param = new Uint32Array([param]);
            } else {
              var primitive = type & 0xFF;
              var array_ctor = table_primitive[primitive];
              var vec = type & 0x1F0000;
              var vec_len = table_vec_len[vec];
              if (vec_len > 1) {
                param = new array_ctor(param);//param is array
              } else {
                param = new array_ctor([param]);//param is scalar value
              }
            }
          }
          kernel.setArg(idx, param);
        };
        break;
      case 'chromium':
      //TODO
          var properties = new WebCLContextProperties();
          properties.platform = $CL.platform;
          properties.deviceType = device_type;
          properties.devices = $CL.devices;
          properties.shareGroup = 1;
          $CL.context = WebCL.createContext(properties);
          $CL.kernelSetArg = function(kernel, idx, param, type) {
          if (type !== void 0) {
            switch (type) {
              case WebCL.type.UINT:
                var type_tmp = WebCL.KERNEL_ARG_UINT;
                break;
              case WebCL.type.INT:
                var type_tmp = WebCL.KERNEL_ARG_INT;
                break;
              case WebCL.type.FLOAT:
                var type_tmp = WebCL.KERNEL_ARG_FLOAT;
                break;
            }
            kernel.setKernelArg(idx, param, type_tmp);
          } else {
            kernel.setKernelArgGlobal(idx, param);
          }
        };
        break;
    }

    switch (env) {
      case 'ff':
        $CL.queue =
          $CL.context.createCommandQueue($CL.selected_device, 0);
        break;
      case 'chromium':
        $CL.queue =
          $CL.context.createCommandQueue($CL.devices, null);
        break;
    }

    $CL.buffers = 0;//number of existing buffers on device
  }


  function initUtilityMethods(WebCL) {
    $CL.createKernel = function (code, name) {
      if (!name) {
        name = 'kernel_func';
      }
      var program = $CL.context.createProgram(code);
      switch (env) {
        case 'ff':
          program.build($CL.devices);
          break;
        case 'chromium':
          program.buildProgram(null, null, null);
          break;
      }
      return program.createKernel(name);
    };

    $CL.createBuffer = function (byte_length) {
      var buffer = $CL.context.createBuffer(WebCL.MEM_READ_WRITE, byte_length);
      $CL.buffers++;
      return buffer;
    };

    $CL.writeBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      $CL.queue.enqueueWriteBuffer(buffer,
        true,//blocking write
        offset,
        typed_array.byteLength,
        typed_array);
    };

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
      switch (env) {
        case 'ff':
          $CL.queue.enqueueNDRangeKernel(kernel,
                                     globalWS.length,
                                     null,
                                     globalWS,
                                     localWS);
          break;
        case 'chromium':
          globalWS = new Int32Array(globalWS);
          $CL.queue.enqueueNDRangeKernel(kernel,
                                     null,
                                     globalWS,
                                     localWS);
          $CL.queue.finish();
          break;
      }
      $CL.queue.flush();
    };

    $CL.flush = function () {
      $CL.queue.flush();
    };

    $CL.finish = function () {
      $CL.queue.finish();
    };

    $CL.readBuffer = function (buffer, typed_array, offset) {
      if (offset === void 0) { offset = 0; }
      $CL.queue.enqueueReadBuffer(buffer,
        true,//blocks until the reading completes
        offset,
        typed_array.byteLength,
        typed_array);
    }

    switch (env) {
      case 'ff':
        $CL.releaseBuffer = function(buffer) {
          buffer.release();
          $CL.buffers--;
        };
        break;
      case 'chromium':
        $CL.releaseBuffer = function(buffer) {
          buffer.releaseCL();
          $CL.buffers--;
        };
        break;
    }
  }

  module.exports = $CL;
})();
