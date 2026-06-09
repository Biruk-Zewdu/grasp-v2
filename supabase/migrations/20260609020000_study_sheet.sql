-- 20260609020000_study_sheet.sql — cache the generated exam-prep study sheet.
-- One row per version; data is the JSON-serialised StudySheetData (tldr, ranked
-- concepts with verbatim definitions + why-lines, key points, tension id).

create table study_sheet (
  id              integer generated always as identity primary key,
  corpus_version  integer not null references corpus_version(id) unique,
  data            text not null,
  created_at      timestamptz not null default now()
);
