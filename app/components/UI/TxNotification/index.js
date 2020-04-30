import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { hideTransactionNotification } from '../../../actions/transactionNotification';
import { connect } from 'react-redux';
import { colors, fontStyles } from '../../../styles/common';
import Ionicons from 'react-native-vector-icons/Ionicons';
import TransactionDetails from '../TransactionElement/TransactionDetails';
import decodeTransaction from '../TransactionElement/utils';
import TransactionNotification from '../TransactionNotification';
import Device from '../../../util/Device';
import Animated, { Easing } from 'react-native-reanimated';
import ElevatedView from 'react-native-elevated-view';
import { strings } from '../../../../locales/i18n';
import { CANCEL_RATE, SPEED_UP_RATE } from 'gaba';
import ActionContent from '../ActionModal/ActionContent';
import TransactionActionContent from '../TransactionActionModal/TransactionActionContent';
import { renderFromWei } from '../../../util/number';

const BROWSER_ROUTE = 'BrowserView';

const styles = StyleSheet.create({
	modalView: {
		flex: 1,
		flexDirection: 'column',
		justifyContent: 'center',
		alignItems: 'center',
		paddingBottom: 200,
		marginBottom: -300
	},
	modalContainer: {
		width: '90%',
		borderRadius: 10,
		backgroundColor: colors.white
	},
	titleWrapper: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderColor: colors.grey100,
		flexDirection: 'row'
	},
	title: {
		flex: 1,
		textAlign: 'center',
		fontSize: 18,
		marginVertical: 12,
		marginHorizontal: 24,
		color: colors.fontPrimary,
		...fontStyles.bold
	},
	modalTypeView: {
		position: 'absolute',
		bottom: 0,
		paddingBottom: Device.isIphoneX() ? 20 : 10,
		left: 0,
		right: 0,
		backgroundColor: colors.transparent
	},
	modalViewInBrowserView: {
		paddingBottom: Device.isIos() ? 130 : 120
	},
	modalTypeViewDetailsVisible: {
		height: '100%',
		backgroundColor: colors.greytransparent
	},
	modalTypeViewBrowser: {
		bottom: Device.isIphoneX() ? 70 : 60
	},
	closeIcon: {
		paddingTop: 4,
		position: 'absolute',
		right: 16
	},
	notificationContainer: {
		flex: 0.1,
		flexDirection: 'row',
		alignItems: 'flex-end'
	},
	notificationWrapper: {
		height: 70,
		width: '100%'
	},
	detailsContainer: {
		flex: 1,
		width: '300%',
		flexDirection: 'row'
	},
	transactionAction: {
		width: '100%'
	}
});

const WINDOW_WIDTH = Dimensions.get('window').width;

/**
 * Wrapper component for a global alert
 * connected to redux
 */
class TxNotification extends PureComponent {
	static propTypes = {
		/**
		/* navigation object required to push new views
		*/
		navigation: PropTypes.object,
		/**
		 * Boolean that determines if the modal should be shown
		 */
		isVisible: PropTypes.bool.isRequired,
		/**
		 * Number that determines when it should be autodismissed (in miliseconds)
		 */
		autodismiss: PropTypes.number,
		/**
		 * function that dismisses de modal
		 */
		hideTransactionNotification: PropTypes.func,
		/**
		 * An array that represents the user transactions on chain
		 */
		transactions: PropTypes.array,
		/**
		 * Corresponding transaction can contain id, nonce and amount
		 */
		transaction: PropTypes.object,
		/**
		 * String of selected address
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		selectedAddress: PropTypes.string,
		/**
		 * Current provider ticker
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		ticker: PropTypes.string,
		/**
		 * ETH to current currency conversion rate
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		conversionRate: PropTypes.number,
		/**
		 * Currency code of the currently-active currency
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		currentCurrency: PropTypes.string,
		/**
		 * Current exchange rate
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		exchangeRate: PropTypes.number,
		/**
		 * Object containing token exchange rates in the format address => exchangeRate
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		contractExchangeRates: PropTypes.object,
		/**
		 * An array that represents the user collectible contracts
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		collectibleContracts: PropTypes.array,
		/**
		 * An array that represents the user tokens
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		tokens: PropTypes.object,
		/**
		 * Transaction status
		 */
		status: PropTypes.string,
		/**
		 * Primary currency, either ETH or Fiat
		 */
		// eslint-disable-next-line react/no-unused-prop-types
		primaryCurrency: PropTypes.string
	};

	state = {
		transactionDetails: undefined,
		transactionElement: undefined,
		tx: {},
		transactionDetailsIsVisible: false,
		internalIsVisible: true,
		inBrowserView: false
	};

	notificationAnimated = new Animated.Value(100);
	detailsYAnimated = new Animated.Value(-WINDOW_WIDTH);
	speedUpXAnimated = new Animated.Value(-WINDOW_WIDTH);
	cancelXAnimated = new Animated.Value(-WINDOW_WIDTH);
	detailsAnimated = new Animated.Value(0);

	existingGasPriceDecimal = '0x0';

	animatedTimingStart = (animatedRef, toValue) => {
		Animated.timing(animatedRef, {
			toValue,
			duration: 500,
			easing: Easing.linear,
			useNativeDriver: true
		}).start();
	};

	detailsFadeIn = async () => {
		await this.setState({ transactionDetailsIsVisible: true });
		this.animatedTimingStart(this.detailsAnimated, 1);
	};

	componentDidMount = () => {
		this.props.hideTransactionNotification();
		// To get the notificationAnimated ref when component mounts
		setTimeout(() => this.setState({ internalIsVisible: this.props.isVisible }), 100);
	};

	isInBrowserView = () => {
		const currentRouteName = this.findRouteNameFromNavigatorState(this.props.navigation.state);
		return currentRouteName === BROWSER_ROUTE;
	};

	componentDidUpdate = async prevProps => {
		// Check whether current view is browser
		if (this.props.isVisible && prevProps.navigation.state !== this.props.navigation.state) {
			// eslint-disable-next-line react/no-did-update-set-state
			this.setState({ inBrowserView: this.isInBrowserView(prevProps) });
		}
		if (!prevProps.isVisible && this.props.isVisible) {
			// Auto dismiss notification in case of confirmations
			this.props.autodismiss &&
				setTimeout(() => {
					this.props.hideTransactionNotification();
				}, this.props.autodismiss);
			// <<<<<<<<<<<<   FIX THIS   >>>>>>>>>>>>>>>>
			// Find new transaction and parse its data
			// const { paymentChannelTransaction } = this.props.transaction;
			// const tx = paymentChannelTransaction
			// 	? { paymentChannelTransaction, transaction: {} }
			// 	: this.props.transactions.find(({ id }) => id === this.props.transaction.id);
			const tx = this.props.transactions[0];
			const [transactionElement, transactionDetails] = await decodeTransaction({ ...this.props, tx });
			const existingGasPrice = tx.transaction ? tx.transaction.gasPrice : '0x0';
			this.existingGasPriceDecimal = parseInt(existingGasPrice === undefined ? '0x0' : existingGasPrice, 16);
			// eslint-disable-next-line react/no-did-update-set-state
			await this.setState({
				tx,
				transactionElement,
				transactionDetails,
				internalIsVisible: true,
				transactionDetailsIsVisible: false,
				inBrowserView: this.isInBrowserView(prevProps)
			});

			setTimeout(() => this.animatedTimingStart(this.notificationAnimated, 0), 100);
		} else if (prevProps.isVisible && !this.props.isVisible) {
			this.animatedTimingStart(this.notificationAnimated, 200);
			this.animatedTimingStart(this.detailsAnimated, 0);
			// eslint-disable-next-line react/no-did-update-set-state
			setTimeout(
				() =>
					this.setState({
						internalIsVisible: false,
						tx: undefined,
						transactionElement: undefined,
						transactionDetails: undefined
					}),
				500
			);
		}
	};

	findRouteNameFromNavigatorState({ routes }) {
		let route = routes[routes.length - 1];
		while (route.index !== undefined) route = route.routes[route.index];
		return route.routeName;
	}

	componentWillUnmount = () => {
		this.props.hideTransactionNotification();
	};

	onClose = () => {
		this.onCloseDetails();
		this.props.hideTransactionNotification();
	};

	onCloseDetails = () => {
		this.animatedTimingStart(this.detailsAnimated, 0);
		setTimeout(() => this.setState({ transactionDetailsIsVisible: false }), 1000);
	};

	onPress = () => {
		this.setState({ transactionDetailsIsVisible: true });
	};

	onNotificationPress = () => {
		const {
			tx: { paymentChannelTransaction }
		} = this.state;
		if (paymentChannelTransaction) {
			this.props.navigation.navigate('PaymentChannelHome');
		} else {
			this.detailsFadeIn();
		}
	};

	onSpeedUpPress = () => {
		this.animatedTimingStart(this.detailsYAnimated, 0);
		this.animatedTimingStart(this.speedUpXAnimated, 0);
	};

	onSpeedUpFinish = () => {
		this.animatedTimingStart(this.detailsYAnimated, -WINDOW_WIDTH);
		this.animatedTimingStart(this.speedUpXAnimated, -WINDOW_WIDTH);
	};

	onCancelPress = () => {
		this.animatedTimingStart(this.detailsYAnimated, -2 * WINDOW_WIDTH);
		this.animatedTimingStart(this.cancelXAnimated, -2 * WINDOW_WIDTH);
	};

	onCancelFinish = () => {
		this.animatedTimingStart(this.detailsYAnimated, -WINDOW_WIDTH);
		this.animatedTimingStart(this.cancelXAnimated, -WINDOW_WIDTH);
	};

	cancelTransaction = () => {
		this.onCancelFinish();
	};

	speedupTransaction = () => {
		this.onSpeedUpFinish();
	};

	render = () => {
		const { navigation, status } = this.props;
		const {
			transactionElement,
			transactionDetails,
			tx,
			transactionDetailsIsVisible,
			internalIsVisible,
			inBrowserView
		} = this.state;

		if (!internalIsVisible) return null;
		const { paymentChannelTransaction } = tx;
		return (
			<ElevatedView
				style={[
					styles.modalTypeView,
					inBrowserView ? styles.modalTypeViewBrowser : {},
					transactionDetailsIsVisible && !paymentChannelTransaction ? styles.modalTypeViewDetailsVisible : {}
				]}
			>
				<View style={styles.detailsContainer}>
					<Animated.View
						style={[
							styles.modalView,
							{ opacity: this.detailsAnimated },
							inBrowserView ? styles.modalViewInBrowserView : {},
							{ transform: [{ translateX: this.speedUpXAnimated }] }
						]}
					>
						<View style={styles.transactionAction}>
							<ActionContent
								onCancelPress={this.onSpeedUpFinish}
								onConfirmPress={this.speedupTransaction}
								confirmText={strings('transaction.lets_try')}
								cancelText={strings('transaction.nevermind')}
							>
								<TransactionActionContent
									confirmDisabled={false}
									feeText={`${renderFromWei(
										Math.floor(this.existingGasPriceDecimal * SPEED_UP_RATE)
									)} ${strings('unit.eth')}`}
									titleText={strings('transaction.cancel_tx_title')}
									gasTitleText={strings('transaction.gas_speedup_fee')}
									descriptionText={strings('transaction.speedup_tx_message')}
								/>
							</ActionContent>
						</View>
					</Animated.View>
					{transactionDetailsIsVisible && !paymentChannelTransaction && (
						<Animated.View
							style={[
								styles.modalView,
								{ opacity: this.detailsAnimated },
								inBrowserView ? styles.modalViewInBrowserView : {},
								{ transform: [{ translateX: this.detailsYAnimated }] }
							]}
						>
							<View style={styles.modalContainer}>
								<View style={styles.titleWrapper}>
									<Text style={styles.title} onPress={this.onCloseDetails}>
										{transactionElement.actionKey}
									</Text>
									<Ionicons
										onPress={this.onCloseDetails}
										name={'ios-close'}
										size={38}
										style={styles.closeIcon}
									/>
								</View>
								<TransactionDetails
									transactionObject={tx}
									transactionDetails={transactionDetails}
									navigation={navigation}
									close={this.onClose}
									showSpeedUpModal={this.onSpeedUpPress}
									showCancelModal={this.onCancelPress}
								/>
							</View>
						</Animated.View>
					)}

					<Animated.View
						style={[
							styles.modalView,
							{ opacity: this.detailsAnimated },
							inBrowserView ? styles.modalViewInBrowserView : {},
							{ transform: [{ translateX: this.cancelXAnimated }] }
						]}
					>
						<View style={styles.transactionAction}>
							<ActionContent
								onCancelPress={this.onCancelFinish}
								onConfirmPress={this.cancelTransaction}
								confirmText={strings('transaction.lets_try')}
								cancelText={strings('transaction.nevermind')}
							>
								<TransactionActionContent
									confirmDisabled={false}
									feeText={`${renderFromWei(
										Math.floor(this.existingGasPriceDecimal * CANCEL_RATE)
									)} ${strings('unit.eth')}`}
									titleText={strings('transaction.cancel_tx_title')}
									gasTitleText={strings('transaction.gas_cancel_fee')}
									descriptionText={strings('transaction.cancel_tx_message')}
								/>
							</ActionContent>
						</View>
					</Animated.View>
				</View>
				<Animated.View
					style={[styles.notificationContainer, { transform: [{ translateY: this.notificationAnimated }] }]}
				>
					<View style={styles.notificationWrapper}>
						<TransactionNotification
							status={status}
							transaction={{ ...tx.transaction, ...this.props.transaction }}
							onPress={this.onNotificationPress}
							onHide={this.onClose}
						/>
					</View>
				</Animated.View>
			</ElevatedView>
		);
	};
}

const mapStateToProps = state => ({
	isVisible: state.transactionNotification.isVisible,
	autodismiss: state.transactionNotification.autodismiss,
	transaction: state.transactionNotification.transaction,
	status: state.transactionNotification.status,
	selectedAddress: state.engine.backgroundState.PreferencesController.selectedAddress,
	transactions: state.engine.backgroundState.TransactionController.transactions,
	ticker: state.engine.backgroundState.NetworkController.provider.ticker,
	tokens: state.engine.backgroundState.AssetsController.tokens.reduce((tokens, token) => {
		tokens[token.address] = token;
		return tokens;
	}, {}),
	collectibleContracts: state.engine.backgroundState.AssetsController.collectibleContracts,
	contractExchangeRates: state.engine.backgroundState.TokenRatesController.contractExchangeRates,
	conversionRate: state.engine.backgroundState.CurrencyRateController.conversionRate,
	currentCurrency: state.engine.backgroundState.CurrencyRateController.currentCurrency,
	primaryCurrency: state.settings.primaryCurrency
});

const mapDispatchToProps = dispatch => ({
	hideTransactionNotification: () => dispatch(hideTransactionNotification())
});

export default connect(
	mapStateToProps,
	mapDispatchToProps
)(TxNotification);
