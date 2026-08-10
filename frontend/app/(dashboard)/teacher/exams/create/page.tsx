"use client";

export default function CreateExamPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Admin / Create New Exam</p>
        <h2 className="text-2xl font-bold">Exam Configuration</h2>
        <p className="text-muted-foreground">Define your exam parameters and AI proctoring constraints</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">description</span>
            General Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Exam Title</label>
              <input className="w-full p-2 border border-input rounded-lg mt-1 bg-background" placeholder="e.g., Final Examination: Advanced Neural Networks" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Subject</label>
                <select className="w-full p-2 border border-input rounded-lg mt-1 bg-background">
                  <option>Computer Science</option>
                  <option>Artificial Intelligence</option>
                  <option>Data Ethics</option>
                  <option>Mathematics</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Total Marks</label>
                <input className="w-full p-2 border border-input rounded-lg mt-1 bg-background" placeholder="100" type="number" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Description</label>
              <textarea className="w-full p-2 border border-input rounded-lg mt-1 bg-background resize-none" placeholder="Enter exam description..." rows={3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
