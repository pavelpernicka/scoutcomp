import { useTranslation } from "react-i18next";
import PropTypes from 'prop-types';
import Modal from './Modal';

const TaskCompletionDetailsModal = ({
  isVisible,
  onClose,
  userTaskDetails,
  isLoading = false,
  title
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={title || t("leaderboard.completionDetails")}
      subtitle={userTaskDetails?.real_name || userTaskDetails?.username}
      icon={<i className="fas fa-chart-bar" />}
      size="lg"
      footer={<button type="button" className="btn btn-secondary" onClick={onClose}><i className="fas fa-times me-2" />{t("common.close")}</button>}
    >
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">{t("common.loading")}</span>
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
                              {t("leaderboard.taskColumn")}
                            </th>
                            <th className="text-center border-0">
                              <i className="fas fa-layer-group me-2 text-secondary"></i>
                              {t("leaderboard.variantsColumn")}
                            </th>
                            <th className="text-end border-0">
                              <i className="fas fa-chart-bar me-2 text-info"></i>
                              {t("leaderboard.completionsColumn")}
                            </th>
                            <th className="text-end border-0">
                              <i className="fas fa-trophy me-2 text-warning"></i>
                              {t("leaderboard.pointsColumn")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {userTaskDetails.task_completions
                            .sort((a, b) => b.total_points - a.total_points)
                            .map((task) => (
                            <tr key={task.task_id}>
                              <td>{task.task_name}</td>
                              <td className="text-center">
                                {task.variants && task.variants.length > 0 ? (
                                  <div className="d-flex flex-wrap gap-1 justify-content-center">
                                    {task.variants
                                      .sort((a, b) => b.completion_count - a.completion_count)
                                      .map((variant) => (
                                        <span
                                          key={variant.variant_id}
                                          className="badge bg-secondary bg-opacity-75 text-dark small"
                                          title={t("leaderboard.variantSummary", { name: variant.variant_name, count: variant.completion_count, points: variant.total_points.toFixed(1) })}
                                        >
                                          {variant.variant_name} ({variant.completion_count}×)
                                        </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted small">
                                    <i className="fas fa-minus"></i>
                                  </span>
                                )}
                              </td>
                              <td className="text-end">{task.completion_count}</td>
                              <td className="text-end fw-bold">{task.total_points.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="table-light">
                          <tr>
                            <th>{t("leaderboard.totalRow")}</th>
                            <th className="text-center">
                              <span className="text-muted small">—</span>
                            </th>
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
                      {t("leaderboard.noCompletedTasks")}
                    </p>
                  )}
                </>
              )}
    </Modal>
  );
};

TaskCompletionDetailsModal.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userTaskDetails: PropTypes.shape({
    username: PropTypes.string,
    real_name: PropTypes.string,
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
