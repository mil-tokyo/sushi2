import $M = require('../src/sushi');
import BenchBase = require('./bench_base');

class transpose extends BenchBase {
  constructor(public m: number, public n: number) {
    super();
    this.name = "transpose " + m + "*" + n;
  }

  setup() {
    var a = $M.gpuArray($M.rand(this.m, this.n));
    return [a];
  }

  run(a: $M.Matrix): void {
    $M.t(a);
  }
}

export = transpose;
