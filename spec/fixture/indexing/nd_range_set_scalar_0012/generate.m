x = rand(6, 8, 1);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(4,[1 3 4 1 4],[1 1 1 1 1]);
y = rand;
z = x;
z(4,[1 3 4 1 4],[1 1 1 1 1]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
