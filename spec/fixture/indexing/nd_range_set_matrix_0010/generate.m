x = rand(6, 2, 6);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(end-4:-6:3,[1 1 1 1 1],1);
y = rand(size(t));
z = x;
z(end-4:-6:3,[1 1 1 1 1],1) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
