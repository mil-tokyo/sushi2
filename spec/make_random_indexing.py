#!/usr/bin/env python

# generates random test case for matrix indexing

import sys,os
import numpy as np
import subprocess
import tempfile
import scipy.io
import shutil
from collections import defaultdict

STR_SUSHI = False

class EndOffset:
    def __init__(self, offset):
        # offset = -5 => "end-5"
        self.offset = offset
    
    def __str__(self):
        if STR_SUSHI:
            return "$M.end{:+}".format(self.offset)
        else:
            return "end{:+}".format(self.offset)

class Colon:
    def __init__(self, start, step, end):
        self.start = start
        self.step = step
        self.end = end
    
    def __str__(self):
        if STR_SUSHI:
            if self.start is None:
                return "$M.colon()"
            elif self.step is not None:
                return "$M.colon({0},{1},{2})".format(self.start, self.step, self.end)
            else:
                return "$M.colon({0},{1})".format(self.start, self.end)
        else:
            if self.start is None:
                return ":"
            elif self.step is not None:
                return "{0}:{1}:{2}".format(self.start, self.step, self.end)
            else:
                return "{0}:{1}".format(self.start, self.end)

class Matrix:
    def __init__(self, array):
        self.array = array#numpy array
    
    def __str__(self):
        if STR_SUSHI:
            return "$M.jsa2mat({}, false, 'int32')".format(self.array.tolist())
        else:
            if self.array.ndim == 1:
                return "[{}]".format(" ".join(map(str, self.array.tolist())))
            elif self.array.ndim == 2:
                rows_str = [" ".join(map(str, row)) for row in self.array.tolist()]
                return "[{}]".format(";".join(rows_str))
            else:
                raise ValueError('ndim > 2')

def randint_noisy(low, high):
    if np.random.random() < 0.01:
        # generate out of range
        if np.random.random() < 0.5:
            return low - 1
        else:
            return high
    else:
        if low == high:
            return low
        return np.random.randint(low, high)#[low, high)

def generate_get_octave_script(x_shape, indexer):
    STR_SUSHI = False
    commands = []
    commands.append("x = rand{};".format(tuple(x_shape)))#rand(2,3)
    commands.append("y = 0;")
    commands.append("z = 0;")
    commands.append("indexing_error = 0;")
    commands.append("try")
    commands.append("y = x({});".format(",".join(map(str, indexer))))
    commands.append("catch")
    commands.append("indexing_error = 1;")
    commands.append("end")
    commands.append("save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')")
    commands.append("")
    return "\n".join(commands)

def generate_set_octave_script(x_shape, indexer, set_scalar):
    global STR_SUSHI
    STR_SUSHI = False
    commands = []
    commands.append("x = rand{};".format(tuple(x_shape)))#rand(2,3)
    commands.append("y = 0;")
    commands.append("z = 0;")
    commands.append("indexing_error = 0;")
    commands.append("try")
    commands.append("t = x({});".format(",".join(map(str, indexer))))# get shape of indexed area
    if set_scalar:
        commands.append("y = rand;")
    else:
        commands.append("y = rand(size(t));")
    commands.append("z = x;")
    commands.append("z({}) = y;".format(",".join(map(str, indexer))))
    commands.append("catch")
    commands.append("indexing_error = 1;")
    commands.append("end")
    commands.append("if ~isequal(size(x), size(z))")#size expansion is not supported in sushi
    commands.append("indexing_error = 1;")
    commands.append("end")
    commands.append("save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')")
    commands.append("")
    return "\n".join(commands)

def execute_octave(commands):
    tmpdir = tempfile.mkdtemp()
    script_path = tmpdir + "/script.m"
    with open(script_path, "w") as f:
        f.write(commands)
    subprocess.check_call(["octave", "--no-gui", "--silent", script_path], cwd = tmpdir)
    result_mat = scipy.io.loadmat(tmpdir + "/result.mat")
    shutil.rmtree(tmpdir)
    return result_mat

def generate_get_expect_js(x_shape, indexer):
    global STR_SUSHI
    STR_SUSHI = True
    commands = []
    indexer_str = ",".join(map(str, indexer))
    commands.append("if (indexing_error.get() > 0) {{expect(() => x.get({0})).toThrow();}} else {{var t = x.get({0}); if (typeof(t) === 'number') {{t = $M.jsa2mat([[t]]);}}; expect($M.isequal(t, y)).toBeTruthy();}}".format(indexer_str))
    return "\n".join(commands)

def generate_set_expect_js(x_shape, indexer):
    global STR_SUSHI
    STR_SUSHI = True
    commands = []
    indexer_str = ",".join(map(str, indexer))
    commands.append("if (indexing_error.get() > 0) {{expect(() => x.set({0}, y)).toThrow();}} else {{x.set({0}, y); expect($M.isequal(x, z)).toBeTruthy();}}".format(indexer_str))
    return "\n".join(commands)

case_serial = defaultdict(int)
def save_case(name, result_mat, expect_js):
    output_dir = "fixture/indexing/{}_{:04d}".format(name, case_serial[name])
    case_serial[name] += 1
    if os.path.exists(output_dir):
        print("{} exists; passing".format(output_dir))
        return
    os.mkdir(output_dir)
    for key in ["x", "y", "z", "indexing_error"]:
        np.save("{}/{}.npy".format(output_dir, key), result_mat[key])
    with open("{}/expect.js".format(output_dir), "w") as f:
        f.write(expect_js)

def make_case(name, x_shape, indexer, is_set, set_scalar):
    if is_set:
        octave_commands = generate_set_octave_script(x_shape, indexer, set_scalar)
        js_commands = generate_set_expect_js(x_shape, indexer)
    else:
        octave_commands = generate_get_octave_script(x_shape, indexer)
        js_commands = generate_get_expect_js(x_shape, indexer)
    result_mat = execute_octave(octave_commands)
    save_case(name, result_mat, js_commands)

def make_case_3(name, x_shape, indexer):
    make_case(name + "_get", x_shape, indexer, False, False)
    make_case(name + "_set_matrix", x_shape, indexer, True, False)
    make_case(name + "_set_scalar", x_shape, indexer, True, True)

def case_nd_scalar(ndim):
    shape = tuple(np.random.randint(1, 4, (ndim)))
    index_len = np.random.randint(2, ndim + 1)
    indexer = []
    for i in range(index_len):
        if i < index_len - 1:
            indexer.append(randint_noisy(1, shape[i] + 1))
        else:
            indexer.append(randint_noisy(1, np.prod(shape[i:]) + 1))#last index is like linear index of remaining dims
    if np.random.random() < 0.1:
        indexer.append(np.random.randint(1, 3))#1 is ok, others raise error
    make_case_3("nd_scalar", shape, indexer)

def main():
    for ndim in range(2, 6):
        for i in range(10):
            case_nd_scalar(ndim)
main()
