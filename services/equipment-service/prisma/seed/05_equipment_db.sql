INSERT INTO "EquipmentType" (id,name,"createdAt","updatedAt") VALUES
 ('eq_projector','projector',now(),now()),('eq_microphone','microphone',now(),now()),('eq_speaker','speaker',now(),now()),('eq_lighting','lighting',now(),now()),('eq_stage','stage',now(),now()) ON CONFLICT (name) DO NOTHING;
INSERT INTO equipment_stock ("equipmentType",total,version,"updatedAt") SELECT name,0,1,now() FROM "EquipmentType" ON CONFLICT DO NOTHING;
