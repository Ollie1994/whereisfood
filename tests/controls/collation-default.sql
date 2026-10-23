-- run: db-trucks
-- red: listActiveTrucks > returns active trucks in Swedish name order, without inactive ones, with exactly the selected keys

alter table trucks alter column name type text collate "default";
