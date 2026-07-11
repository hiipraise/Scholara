// src/pages/CoursesPage.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { coursesApi } from "../api/index";
import { useAuthStore } from "../store/authStore";
import type { Course } from "../types";
import { COURSE_COLORS } from "../constants/courseColors";
import CourseCard from "../components/courses/CourseCard";

export default function CoursesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [newCourse, setNewCourse] = useState({
    code: "",
    title: "",
    level: user?.level || "100L",
    semester: user?.semester || 1,
    credit_units: 3,
  });

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses", "all"],
    queryFn: () => coursesApi.list().then((r) => r.data),
  });

  const selectedLevel = user?.level || "100L";
  const selectedSemester = user?.semester || 1;

  const selectedCourses = useMemo(
    () =>
      (courses ?? []).filter(
        (course) =>
          course.level === selectedLevel &&
          course.semester === selectedSemester,
      ),
    [courses, selectedLevel, selectedSemester],
  );

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredCourses = useMemo(
    () =>
      selectedCourses.filter((course) => {
        if (!normalizedSearch) return true;
        return (
          course.code.toLowerCase().includes(normalizedSearch) ||
          course.title.toLowerCase().includes(normalizedSearch) ||
          `${course.level} semester ${course.semester}`
            .toLowerCase()
            .includes(normalizedSearch)
        );
      }),
    [selectedCourses, normalizedSearch],
  );

  const addCourseMutation = useMutation({
    mutationFn: (data: typeof newCourse) => coursesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      setShowAddCourse(false);
      setNewCourse((prev) => ({ ...prev, code: "", title: "" }));
      toast.success("Course added");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail || "Failed to add course"),
  });

  return (
    <div className="space-y-6 pb-12">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
            {selectedLevel} · Semester {selectedSemester}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
            Courses
          </h1>
          <p className="text-cream-200/45 text-sm mt-1">
            {filteredCourses.length} course
            {filteredCourses.length === 1 ? "" : "s"} for your selected term ·
            BSc. Software Engineering
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddCourse((v) => !v)}
            className="flex items-center gap-2 btn-ghost text-sm"
          >
            <Plus size={15} /> Add Course
          </button>
        )}
      </motion.div>

      <div className="card p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-200/25"
          />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search courses for your selected term..."
            className="input-field pl-9"
          />
        </div>
      </div>

      <AnimatePresence>
        {showAddCourse && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5">
              <h3 className="text-cream-200/70 text-sm font-semibold mb-4">
                Add New Course
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <input
                  placeholder="Code (e.g. COS201)"
                  value={newCourse.code}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="input-field"
                />
                <input
                  placeholder="Course Title"
                  value={newCourse.title}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, title: e.target.value })
                  }
                  className="input-field col-span-2 sm:col-span-1"
                />
                <select
                  value={newCourse.level}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, level: e.target.value })
                  }
                  className="input-field"
                >
                  {["100L", "200L", "300L", "400L"].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
                <select
                  value={newCourse.semester}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      semester: Number(e.target.value),
                    })
                  }
                  className="input-field"
                >
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
                <input
                  type="number"
                  placeholder="Credit Units"
                  value={newCourse.credit_units}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      credit_units: Number(e.target.value),
                    })
                  }
                  className="input-field"
                  min={1}
                  max={6}
                />
              </div>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => addCourseMutation.mutate(newCourse)}
                  disabled={
                    !newCourse.code ||
                    !newCourse.title ||
                    addCourseMutation.isPending
                  }
                  className="btn-primary text-sm"
                >
                  {addCourseMutation.isPending ? "Adding..." : "Add Course"}
                </motion.button>
                <button
                  onClick={() => setShowAddCourse(false)}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-20 shimmer-bg rounded-2xl" />
          ))}
        </div>
      ) : filteredCourses.length > 0 ? (
        <div className="space-y-3">
          {filteredCourses.map((course, index) => (
            <CourseCard
              key={course.id}
              course={course}
              color={COURSE_COLORS[index % COURSE_COLORS.length]}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <BookOpen size={40} className="text-cream-200/15 mx-auto mb-3" />
          <h3 className="font-display text-xl text-cream-200 mb-2">
            {searchText.trim()
              ? "No matching courses"
              : "No courses for the selected term yet"}
          </h3>
          <p className="text-cream-200/35 text-sm">
            {searchText.trim()
              ? "Try a different keyword."
              : "Update your academic level or semester in Profile settings to view another term."}
          </p>
        </div>
      )}
    </div>
  );
}
