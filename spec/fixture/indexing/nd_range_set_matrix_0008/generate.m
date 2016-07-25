x = rand(7, 8);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(end-3:-4:4,6,2);
y = rand(size(t));
z = x;
z(end-3:-4:4,6,2) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
