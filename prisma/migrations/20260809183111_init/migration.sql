-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('IN_PERSON', 'HYBRID', 'ONLINE_SYNC', 'ONLINE_ASYNC');

-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('LECTURE', 'LAB', 'DISCUSSION', 'SEMINAR', 'OTHER');

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "classNbr" TEXT,
    "term" TEXT NOT NULL,
    "instructor" TEXT,
    "mode" "Mode" NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "days" TEXT[],
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "kind" "MeetingKind" NOT NULL DEFAULT 'LECTURE',
    "building" TEXT,
    "room" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_subject_number_key" ON "Course"("subject", "number");

-- CreateIndex
CREATE INDEX "Section_courseId_idx" ON "Section"("courseId");

-- CreateIndex
CREATE INDEX "Section_term_idx" ON "Section"("term");

-- CreateIndex
CREATE UNIQUE INDEX "Section_term_courseId_sectionCode_key" ON "Section"("term", "courseId", "sectionCode");

-- CreateIndex
CREATE INDEX "Meeting_sectionId_idx" ON "Meeting"("sectionId");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
