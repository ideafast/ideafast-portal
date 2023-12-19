import React, { useState, createContext, useContext, FunctionComponent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthContextState {
  showRegistrationDialog: boolean;
  setShowRegistrationDialog: (show: boolean) => void;
  handleCancelRegistration: () => void;
}

const AuthContext = createContext<AuthContextState | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: FunctionComponent<AuthProviderProps> = ({ children }) => {
    const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
    const navigate = useNavigate();

    const handleCancelRegistration = () => {
        console.log('handleCancelRegistration, executed');
        if (showRegistrationDialog){
            setShowRegistrationDialog(false);
        }
        navigate('/');
    };

    return (
        <AuthContext.Provider value={{ showRegistrationDialog, setShowRegistrationDialog, handleCancelRegistration }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextState => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
