x = rand(6, 6);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(5,[5 1 1 4 2]);
y = rand;
z = x;
z(5,[5 1 1 4 2]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
