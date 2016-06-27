import sys
import numpy as np

def check_data_1(path):
  actual = np.load(path)
  assert actual.dtype == np.float32
  expect = np.array([[10, 20, 30], [40, 50, 60]], dtype = np.float32)
  assert np.allclose(expect, actual)

def check_data_2(path):
  actual = np.load(path)
  assert actual.dtype == np.int32
  assert actual.shape == (1, 1, 1, 1, 1, 1, 1, 1, 2, 3)
  actual = actual.reshape(2, 3)
  expect = np.array([[10, 20, 30], [40, 50, 60]], dtype = np.float32)
  assert np.allclose(expect, actual)

check_data_1(sys.argv[1])
check_data_2(sys.argv[2])
