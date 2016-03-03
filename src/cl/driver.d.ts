declare module driver {
  class clBuffer{}
  class clKernel{}
  export function createBuffer(byte_length: number): clBuffer;
  export function createKernel(code: string, name?: string): clKernel;
  export function writeBuffer(buffer: clBuffer, typed_array: any, offset?: number): void;
  export function readBuffer(buffer: clBuffer, typed_array: any, offset?: number): void;
  export function releaseBuffer(buffer: clBuffer): void;
  export function executeKernel(kernel: clKernel, params: any[], parallelization: (number | number[]), localWS?: (number | number[])): void;
  export var buffers: number;
  export var WebCL: any;
}

export = driver;
