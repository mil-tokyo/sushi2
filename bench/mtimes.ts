import $M = require('../src/sushi');
import BenchBase = require('./bench_base');

class mtimes extends BenchBase {
  constructor(public m: number, public n: number, public k: number) {
    super();
    this.name = "mtimes " + m + "*" + n + "*" + k;
  }

  setup() {
    var a = $M.gpuArray($M.rand(this.m, this.k));
    var b = $M.gpuArray($M.rand(this.k, this.n));
    $M.mtimes(a, b);//compile kernel
    return [a, b];
  }

  run(a: $M.Matrix, b: $M.Matrix): void {
    $M.mtimes(a, b);
  }
}

export = mtimes;
