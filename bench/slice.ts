import $M = require('../src/sushi');
import BenchBase = require('./bench_base');

class slice extends BenchBase {
  constructor(public get_set: string, public size: number[], public slicer: any[]) {
    super();
    this.name = "slicer [" + size + "]." + get_set + "(" + slicer + ")";
    switch (get_set) {
      case 'get':
        this.run = this.run_get;
        break;
      case 'set':
        this.run = this.run_set;
        break;
      default:
        throw Error('get or set');
    }
  }

  setup() {
    var a = $M.gpuArray($M.rand(...this.size));
    var b = null;
    if (this.get_set == 'set') {
      var sizecheck = a.get(...this.slicer);
      b = $M.gpuArray($M.rand($M.size(sizecheck)));
    }
    return [a, b];
  }

  run(a: $M.Matrix, b: $M.Matrix): void {

  }

  run_set(a: $M.Matrix, b: $M.Matrix): void {
    var args = this.slicer.concat(b);
    a.set(...args);
  }

  run_get(a: $M.Matrix, b: $M.Matrix): void {
    a.get(...this.slicer);
  }
}

export = slice;
