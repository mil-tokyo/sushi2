// read/write numpy format matrix file

import Matrix = require('../matrix');

function parse_header(header_data: Uint8Array): { descr_wo_endian: string, fortran_order: boolean, shape: number[], little_endian: boolean } {
  //{'descr': '<i4', 'fortran_order': False, 'shape': (3,), }            \n
  var header_str = '';
  for (var i = 0; i < header_data.length; i++) {
    var element = header_data[i];
    header_str += String.fromCharCode(element);
  }

  var hobj = /^\{'descr': '(.*)', 'fortran_order': (True|False), 'shape': \(([0-9, ]+)\), \} *\n$/.exec(header_str);
  if (hobj == null) {
    throw Error('Failed to parse header string');
  }

  var typechars = hobj[1];//"<i4"
  var little_endian = true;
  switch (typechars.substr(0, 1)) {
    case "<":
    case "|"://not applicable (uint8)
      little_endian = true;
      break;
    case ">":
      little_endian = false;
      break;
    default:
      throw Error('Unknown endian');
  }
  var descr_wo_endian = typechars.substr(1, 2);

  var fortran_order = hobj[2] == 'True';
  var shape_str = hobj[3].split(',');
  var shape: number[];
  if (shape_str[1] == '') {
    //1-d array (3,) to column vector (3,1)
    shape = [Number(shape_str[0]), 1];
  } else {
    shape = shape_str.map((v) => Number(v.trim()));
  }

  return { descr_wo_endian: descr_wo_endian, fortran_order: fortran_order, shape: shape, little_endian: little_endian };
}

function is_little_endian(): boolean {
  /**
   * Check if this machine is little endian
   */
  var raw = new Uint8Array([0x1, 0x2, 0x3, 0x4]);
  var view = new Uint32Array(raw.buffer);
  if (view[0] == 0x01020304) {
    //big endian
    return false;
  } else {
    return true;
  }
}

var mat_klass_map = {
  'b1': 'logical',
  'u1': 'uint8',
  'i4': 'int32',
  'f4': 'single',
  'f8': 'single'
};
var view_accessor_map = {
  'b1': DataView.prototype.getUint8,
  'u1': DataView.prototype.getUint8,
  'i4': DataView.prototype.getInt32,
  'f4': DataView.prototype.getFloat32,
  'f8': DataView.prototype.getFloat64
};
var view_bytestep_map = { 'b1': 1, 'u1': 1, 'i4': 4, 'f4': 4, 'f8': 8 };

export function npyread(data: ArrayBuffer | Uint8Array): Matrix {
  //for node: npyread(fs.readFileSync())
  var byteOffset = 0;
  if (ArrayBuffer.isView(data)) {
    //data is Uint8Array
    byteOffset = (<Uint8Array>data).byteOffset;
    data = (<Uint8Array>data).buffer;
  }

  var header_view = new Uint8Array(data, byteOffset);
  //check magic number
  var expect_header = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00];//only format 1 supported
  for (var i = 0; i < expect_header.length; i++) {
    if (header_view[i] != expect_header[i]) {
      throw Error('Incompatible format header');
    }
  }
  var header_len = header_view[8] + header_view[9] * 256;//16bit little endian
  var data_type = parse_header(header_view.slice(10, 10 + header_len));
  var mat_klass = mat_klass_map[data_type.descr_wo_endian];
  if (mat_klass == null) {
    throw Error('Unsupported data type');
  }
  var data_view = new DataView(data, byteOffset + 10 + header_len);
  //b1 seems to have only 0/1, so no conversion needed
  var mat = new Matrix(data_type.shape, mat_klass);
  var mat_data = mat.getdataref();
  var view_accessor = view_accessor_map[data_type.descr_wo_endian];
  var view_bytestep = view_bytestep_map[data_type.descr_wo_endian];
  var numel = mat._numel;
  var view_little_endian = data_type.little_endian;
  for (var i = 0; i < numel; i++) {
    //TODO:support c-order
    var val = view_accessor.call(data_view, view_bytestep * i, view_little_endian);
    mat_data[i] = val;
  }

  return mat;
}

export function npysave(A: Matrix): ArrayBuffer {
  return null;
}