-- Ranking Model V3: the teacher's single per-session evaluation gets its
-- own category so it displays correctly in point history (see
-- listPointCategories()/get_my_point_history() in storageBridge.js) instead
-- of falling back to a generic guessed name. sort_order 0 so it sorts
-- first - it's the primary workflow now, not an addition to the others.
INSERT INTO point_categories (key, name, icon, default_points, active, sort_order)
VALUES ('class_score', 'Class Score', '🎯', 0, true, 0)
ON CONFLICT (key) DO NOTHING;
