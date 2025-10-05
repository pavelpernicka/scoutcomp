import { useTranslation } from "react-i18next";
import PropTypes from 'prop-types';

const TaskCompletionDetailsModal = ({
  isVisible,
  onClose,
  userTaskDetails,
  isLoading = false,
  title = "Task Completion Details"
}) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" tabIndex="-1">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content border-0 shadow-lg">
            <div className="modal-header text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="d-flex align-items-center gap-2">
                <i className="fas fa-chart-bar fs-3"></i>
                <div>
                  <h5 className="modal-title mb-0">{title}</h5>
                  <small className="opacity-90">{userTaskDetails?.real_name || userTaskDetails?.username}</small>
                </div>
              </div>
              <button
                type="button"
                className="btn-close btn-close-white"
                aria-label="Close"
                onClick={onClose}
              ></button>
            </div>
            <div className="modal-body p-4">
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <>
                  {userTaskDetails?.task_completions?.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover border rounded">
                        <thead className="table-light">
                          <tr>
                            <th className="border-0">
                              <i className="fas fa-tasks me-2 text-primary"></i>
                              {t("leaderboard.taskColumn", "Task")}
                            </th>
                            <th className="text-end border-0">
                              <i className="fas fa-chart-bar me-2 text-info"></i>
                              {t("leaderboard.completionsColumn", "Completions")}
                            </th>
                            <th className="text-end border-0">
                              <i className="fas fa-trophy me-2 text-warning"></i>
                              {t("leaderboard.pointsColumn", "Points")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {userTaskDetails.task_completions
                            .sort((a, b) => b.total_points - a.total_points)
                            .map((task) => (
                            <tr key={task.task_id}>
                              <td>{task.task_name}</td>
                              <td className="text-end">{task.completion_count}</td>
                              <td className="text-end fw-bold">{task.total_points.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="table-light">
                          <tr>
                            <th>Total</th>
                            <th className="text-end">
                              {userTaskDetails.task_completions.reduce((sum, t) => sum + t.completion_count, 0)}
                            </th>
                            <th className="text-end">
                              {userTaskDetails.task_completions.reduce((sum, t) => sum + t.total_points, 0).toFixed(2)}
                            </th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted text-center py-4">
                      <i className="fas fa-info-circle me-2"></i>
                      No completed tasks found.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                <i className="fas fa-times me-2"></i>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

TaskCompletionDetailsModal.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userTaskDetails: PropTypes.shape({
    username: PropTypes.string,
    task_completions: PropTypes.arrayOf(
      PropTypes.shape({
        task_id: PropTypes.number,
        task_name: PropTypes.string,
        completion_count: PropTypes.number,
        total_points: PropTypes.number
      })
    )
  }),
  isLoading: PropTypes.bool,
  title: PropTypes.string
};

export default TaskCompletionDetailsModal;