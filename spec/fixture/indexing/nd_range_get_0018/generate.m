x = rand(6, 3, 1);
y = 0;
z = 0;
indexing_error = 0;
try
y = x([1 1 3 3 4],end-1:end+0,[1 1 1 1 1]);
catch
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
