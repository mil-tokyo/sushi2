x = rand(4, 9, 2);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(4:0:2,5,1);
y = rand(size(t));
z = x;
z(4:0:2,5,1) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
