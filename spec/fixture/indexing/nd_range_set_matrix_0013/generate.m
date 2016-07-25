x = rand(3, 3, 9);
y = 0;
z = 0;
indexing_error = 0;
try
t = x([1 2 2 1 1],end-3:11:27);
y = rand(size(t));
z = x;
z([1 2 2 1 1],end-3:11:27) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
