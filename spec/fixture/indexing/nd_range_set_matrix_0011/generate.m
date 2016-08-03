x = rand(3, 9, 2);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(end-2:0:end+0,[7 3 2 8 16]);
y = rand(size(t));
z = x;
z(end-2:0:end+0,[7 3 2 8 16]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
